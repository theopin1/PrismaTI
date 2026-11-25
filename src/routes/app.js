// API das empresas: questionário, avaliações, evidências, resultados e relatórios.
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { one, all, run } from '../db.js';
import { uuid, nowIso } from '../lib/util.js';
import { parse, forbidden, notFound, conflict, badRequest } from '../lib/errors.js';
import { requireAuth, requireRole, loadAssessmentOr404, assertCompanyAccess } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { getPublishedVersion, getVersionFull } from '../services/instrument.js';
import * as A from '../services/assessments.js';
import * as R from '../services/reports.js';
import { saveEvidenceFile, evidenceAbsolutePath, removeEvidenceFile } from '../services/storage.js';
import { renderReportPdf } from '../services/pdf.js';
import { STATUS_LABEL } from '../services/calculation.js';

const r = Router();
r.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxBytes, files: 1 } });

// Somente o Gestor da empresa altera e finaliza (2.3, RF-026); se outro Gestor assumir a empresa, assume a avaliação em andamento.
function assertManager(req, assessment) {
  if (req.user.role !== 'GESTOR' || req.user.companyId !== assessment.company_id) {
    throw forbidden('Somente o Gestor responsável pode alterar ou finalizar esta avaliação.');
  }
  if (assessment.status === 'IN_PROGRESS' && assessment.manager_user_id !== req.user.id) {
    run('UPDATE assessments SET manager_user_id = ?, updated_at = ? WHERE id = ?', req.user.id, nowIso(), assessment.id);
    assessment.manager_user_id = req.user.id;
  }
}
// O administrador só vê respostas e evidências se a configuração permitir (2.2, RNF-010).
function canSeeAnswers(req) {
  return !req.user.is_platform_admin || config.adminCanViewAnswers;
}

// ---------- Empresa do usuário ----------
r.get('/company', requireRole('GESTOR', 'TI'), (req, res) => {
  const c = one('SELECT id, legal_name, trade_name, cnpj, sector, company_size, employee_count_range, contact_email, status FROM companies WHERE id = ?', req.user.companyId);
  const team = all(`SELECT u.name, m.role FROM company_memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.status = 'ACTIVE'`, c.id);
  res.json({ ...c, team, ai_usage: R.usageSummary(c.id) });
});

// ---------- Questionário (explicações e exemplos de evidência pela API, RNF-054) ----------
r.get('/instruments', (_req, res) => {
  const v = getPublishedVersion();
  res.json({ items: all('SELECT id, name, description FROM assessment_instruments'), published_version: v ? { id: v.id, version: v.version, published_at: v.published_at } : null });
});

r.get('/instrument-versions/:id', (req, res) => {
  const v = one('SELECT * FROM instrument_versions WHERE id = ?', req.params.id);
  if (!v) throw notFound();
  // Usuários de empresa só veem a versão publicada ou versões usadas por avaliações da própria empresa
  if (!req.user.is_platform_admin && v.status !== 'PUBLISHED' && !one('SELECT 1 FROM assessments WHERE company_id = ? AND instrument_version_id = ?', req.user.companyId, v.id)) throw notFound();
  const full = getVersionFull(v.id);
  res.json({ id: full.id, version: full.version, status: full.status, published_at: full.published_at, methodology_version: full.methodology_version, dimension_count: full.dimensions.length, question_count: full.questions.length });
});

r.get('/instrument-versions/:id/questions', (req, res) => {
  const v = one('SELECT * FROM instrument_versions WHERE id = ?', req.params.id);
  if (!v) throw notFound();
  if (!req.user.is_platform_admin && v.status !== 'PUBLISHED' && !one('SELECT 1 FROM assessments WHERE company_id = ? AND instrument_version_id = ?', req.user.companyId, v.id)) throw notFound();
  const full = getVersionFull(v.id);
  res.json({ version: full.version, dimensions: full.dimensions, questions: full.questions });
});

// ---------- Avaliações ----------
r.get('/assessments', requireRole('GESTOR', 'TI'), (req, res) => {
  res.json({ items: all(`SELECT a.id, a.status, a.started_at, a.finalized_at, a.updated_at, v.version, r.overall_maturity, r.overall_classification, r.result_status,
                                (SELECT COUNT(*) FROM ai_reports x WHERE x.assessment_id = a.id) AS reports,
                                (SELECT x.id FROM ai_reports x WHERE x.assessment_id = a.id ORDER BY x.report_version DESC LIMIT 1) AS latest_report_id,
                                (SELECT x.report_version FROM ai_reports x WHERE x.assessment_id = a.id ORDER BY x.report_version DESC LIMIT 1) AS latest_report_version
                         FROM assessments a JOIN instrument_versions v ON v.id = a.instrument_version_id LEFT JOIN assessment_results r ON r.assessment_id = a.id
                         WHERE a.company_id = ? ORDER BY a.started_at DESC`, req.user.companyId) });
});

r.post('/assessments', requireRole('GESTOR'), (req, res) => {
  const out = A.startAssessment(req.user);
  if (!out.existing) audit(req, 'assessment.started', { companyId: req.user.companyId, entityType: 'assessment', entityId: out.id });
  res.status(out.existing ? 200 : 201).json(out);
});

r.get('/assessments/:id', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id);
  res.json({ ...A.getAssessmentDetail(a, { includeAnswers: canSeeAnswers(req) }), can_edit: req.user.role === 'GESTOR' && req.user.companyId === a.company_id && a.status === 'IN_PROGRESS' });
});

r.get('/assessments/:id/progress', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id);
  res.json(A.progress(a));
});

const answerBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SCORE'), score: z.number().int().min(0, 'Nota mínima 0.').max(4, 'Nota máxima 4.'), justification: z.string().max(2000).optional() }),
  z.object({ type: z.literal('NA'), justification: z.string().max(2000).optional() }),
  z.object({ type: z.literal('NS'), justification: z.string().max(2000).optional() }),
], { message: 'Tipo de resposta inválido.' });

r.put('/assessments/:id/answers/:questionId', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id, { allowAdmin: false });
  assertManager(req, a);
  const body = parse(answerBody, req.body);
  const out = A.saveAnswer(a, req.user, req.params.questionId, body);
  audit(req, 'answer.saved', { companyId: a.company_id, entityType: 'assessment', entityId: a.id, metadata: { question: out.question_code, type: body.type, score: body.score, change: out.previous } });
  res.json({ ok: true, ...out, progress: A.progress(a) });
});

r.post('/assessments/:id/finalize', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id, { allowAdmin: false });
  assertManager(req, a);
  const out = A.finalizeAssessment(a);
  if (!out.alreadyFinalized) audit(req, 'assessment.finalized', { companyId: a.company_id, entityType: 'assessment', entityId: a.id });
  const fresh = one('SELECT * FROM assessments WHERE id = ?', a.id);
  res.json({ ok: true, already_finalized: out.alreadyFinalized, results: A.getResults(fresh) });
});

r.get('/assessments/:id/results', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id);
  const results = A.getResults(a);
  const v = one('SELECT version FROM instrument_versions WHERE id = ?', a.instrument_version_id);
  res.json({ ...results, instrument_version: v.version, status_label: STATUS_LABEL[results.result_status], questions: canSeeAnswers(req) ? A.getQuestionBreakdown(a) : undefined });
});

// ---------- Evidências (RF-030 a RF-034) ----------
function loadAnswerForAssessment(req, assessmentId, questionId) {
  const a = loadAssessmentOr404(req, assessmentId, { allowAdmin: config.adminCanViewAnswers });
  const ans = one('SELECT * FROM assessment_answers WHERE assessment_id = ? AND question_id = ?', a.id, questionId);
  return { a, ans };
}

r.get('/assessments/:id/answers/:questionId/evidences', (req, res) => {
  const { ans } = loadAnswerForAssessment(req, req.params.id, req.params.questionId);
  if (!ans) return res.json({ items: [], status: 'NAO_INFORMADA' });
  const items = all('SELECT id, evidence_type, description, original_filename, mime_type, file_size, created_at FROM evidences WHERE assessment_answer_id = ? ORDER BY created_at', ans.id);
  res.json({ items, status: A.evidenceStatus(items) });
});

r.post('/assessments/:id/answers/:questionId/evidences', upload.single('file'), (req, res) => {
  const { a, ans } = loadAnswerForAssessment(req, req.params.id, req.params.questionId);
  assertManager(req, a);
  if (a.status !== 'IN_PROGRESS') throw conflict('A avaliação foi finalizada e as evidências estão bloqueadas.', 'ASSESSMENT_LOCKED');
  if (!ans) throw badRequest('Responda a pergunta antes de registrar evidências.');
  const count = one('SELECT COUNT(*) n FROM evidences WHERE assessment_answer_id = ?', ans.id).n;
  if (count >= config.uploads.maxPerAnswer) throw badRequest(`Limite de ${config.uploads.maxPerAnswer} evidências por pergunta.`);
  const body = parse(z.object({
    evidence_type: z.enum(['FILE', 'TEXT', 'DECLARED'], { message: 'Tipo de evidência inválido.' }),
    description: z.string().trim().max(2000).optional(),
  }), req.body);
  if (body.evidence_type === 'TEXT' && !body.description) throw badRequest('Descreva a evidência.', { description: 'Campo obrigatório para evidência descrita.' });
  let file = {};
  if (body.evidence_type === 'FILE') file = saveEvidenceFile(a.company_id, req.file);
  const id = uuid();
  run(`INSERT INTO evidences (id, assessment_answer_id, evidence_type, description, storage_key, original_filename, mime_type, file_size, sha256, uploaded_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, ans.id, body.evidence_type, body.description || (body.evidence_type === 'DECLARED' ? 'Evidência existente, não compartilhada.' : null),
  file.storage_key || null, file.original_filename || null, file.mime_type || null, file.file_size || null, file.sha256 || null, req.user.id, nowIso());
  audit(req, 'evidence.added', { companyId: a.company_id, entityType: 'evidence', entityId: id, metadata: { type: body.evidence_type, size: file.file_size } });
  res.status(201).json({ id });
});

function loadEvidence(req, evidenceId) {
  const e = one(`SELECT e.*, aa.assessment_id FROM evidences e JOIN assessment_answers aa ON aa.id = e.assessment_answer_id WHERE e.id = ?`, evidenceId);
  if (!e) throw notFound('Evidência não encontrada.');
  const a = loadAssessmentOr404(req, e.assessment_id, { allowAdmin: config.adminCanViewAnswers });
  return { e, a };
}

r.get('/evidences/:id/download', (req, res) => {
  const { e, a } = loadEvidence(req, req.params.id);
  if (e.evidence_type !== 'FILE') throw notFound();
  audit(req, 'evidence.downloaded', { companyId: a.company_id, entityType: 'evidence', entityId: e.id });
  res.setHeader('Content-Type', e.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(e.original_filename)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(evidenceAbsolutePath(e.storage_key)).pipe(res);
});

r.delete('/evidences/:id', (req, res) => {
  const { e, a } = loadEvidence(req, req.params.id);
  assertManager(req, a);
  if (a.status !== 'IN_PROGRESS') throw conflict('A avaliação foi finalizada e as evidências estão bloqueadas.', 'ASSESSMENT_LOCKED');
  run('DELETE FROM evidences WHERE id = ?', e.id);
  if (e.storage_key) removeEvidenceFile(e.storage_key);
  audit(req, 'evidence.removed', { companyId: a.company_id, entityType: 'evidence', entityId: e.id });
  res.json({ ok: true });
});

// ---------- Relatórios por IA ----------
r.post('/assessments/:id/reports', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id, { allowAdmin: false });
  if (req.user.role !== 'GESTOR') throw forbidden('Somente o Gestor pode solicitar relatórios.');
  const job = R.requestReport(a, req.user);
  audit(req, 'report.requested', { companyId: a.company_id, entityType: 'report_job', entityId: job.id });
  res.status(202).json(job);
});

r.get('/assessments/:id/reports', (req, res) => {
  const a = loadAssessmentOr404(req, req.params.id);
  res.json({ reports: R.listReports(a.id), jobs: R.listJobs(a.id) });
});

function loadJob(req, id) {
  const j = one('SELECT * FROM ai_report_jobs WHERE id = ?', id);
  if (!j) throw notFound();
  assertCompanyAccess(req, j.company_id);
  return j;
}
r.get('/report-jobs/:id', (req, res) => {
  const j = loadJob(req, req.params.id);
  res.json({ id: j.id, status: j.status, attempt_count: j.attempt_count, requested_at: j.requested_at, started_at: j.started_at, finished_at: j.finished_at, error_code: j.error_code, can_retry: j.status === 'FAILED' && j.attempt_count < config.ai.maxAttempts });
});
r.post('/report-jobs/:id/retry', (req, res) => {
  const j = loadJob(req, req.params.id);
  if (req.user.role !== 'GESTOR') throw forbidden('Somente o Gestor pode repetir a solicitação.');
  const out = R.retryJob(j);
  audit(req, 'report.retry', { companyId: j.company_id, entityType: 'report_job', entityId: j.id });
  res.status(202).json(out);
});

r.get('/reports', requireRole('GESTOR', 'TI'), (req, res) => {
  const items = all(
    `SELECT rp.id, rp.assessment_id, rp.report_version, rp.provider, rp.model_name, rp.generated_at,
            a.finalized_at, v.version AS instrument_version, r.overall_maturity, r.overall_classification
     FROM ai_reports rp
     JOIN assessments a ON a.id = rp.assessment_id
     JOIN instrument_versions v ON v.id = a.instrument_version_id
     LEFT JOIN assessment_results r ON r.assessment_id = a.id
     WHERE rp.company_id = ?
     ORDER BY rp.generated_at DESC`,
    req.user.companyId,
  );
  res.json({ items });
});

function loadReport(req, id) {
  const rep = R.getReportRow(id);
  // Relatório de uma empresa nunca é entregue a outra (RNF-035 / CA-MVP-18)
  assertCompanyAccess(req, rep.company_id);
  return rep;
}
r.get('/reports/:id', (req, res) => {
  const rep = loadReport(req, req.params.id);
  const a = one('SELECT * FROM assessments WHERE id = ?', rep.assessment_id);
  res.json({ id: rep.id, assessment_id: rep.assessment_id, report_version: rep.report_version, model_name: rep.model_name, provider: rep.provider, prompt_version: rep.prompt_version, output_schema_version: rep.output_schema_version, generated_at: rep.generated_at, content: JSON.parse(rep.content), official_results: A.getResults(a) });
});

r.get('/reports/:id/pdf', (req, res) => {
  const rep = loadReport(req, req.params.id);
  const a = one('SELECT * FROM assessments WHERE id = ?', rep.assessment_id);
  const company = one('SELECT legal_name, trade_name FROM companies WHERE id = ?', a.company_id);
  const results = { ...A.getResults(a), instrument_version: one('SELECT version FROM instrument_versions WHERE id = ?', a.instrument_version_id).version };
  audit(req, 'report.exported', { companyId: a.company_id, entityType: 'report', entityId: rep.id });
  const disp = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disp}; filename="PrismaTI-relatorio-v${rep.report_version}.pdf"`);
  renderReportPdf(res, { company, assessment: a, results, report: JSON.parse(rep.content), reportMeta: rep });
});

export default r;
