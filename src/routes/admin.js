// Administração da plataforma (Seção 2.2, RF-002/003/006, RF-008 a RF-019, RF-059, RNF-048).
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, all, run, tx } from '../db.js';
import { uuid, nowIso, addMinutes, randomToken, sha256, paginate } from '../lib/util.js';
import { parse, notFound, badRequest, conflict, AppError } from '../lib/errors.js';
import { requireAdmin, revokeUserSessions } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { sendMail, inviteMail } from '../services/mailer.js';
import * as instrument from '../services/instrument.js';
import { usageSummary } from '../services/reports.js';

const r = Router();
r.use(requireAdmin);
// RNF-007: quando exigido, o administrador precisa ativar a verificação em duas etapas antes de usar o painel.
r.use((req, _res, next) => {
  if (config.adminMfaRequired && !req.user.mfa_enabled) return next(new AppError(403, 'MFA_SETUP_REQUIRED', 'Ative a verificação em duas etapas para usar a administração.'));
  next();
});

const page = (sqlCount, sqlRows, params, q) => {
  const { page: p, pageSize, offset } = paginate(q);
  const total = one(sqlCount, ...params).n;
  const items = all(`${sqlRows} LIMIT ? OFFSET ?`, ...params, pageSize, offset);
  return { items, page: p, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

// ---------- Empresas ----------
const cnpj = z.string().trim().transform((s) => s.replace(/\D/g, '')).refine((s) => s === '' || s.length === 14, 'CNPJ deve ter 14 dígitos.');
const companyBody = z.object({
  legal_name: z.string().trim().min(2, 'Informe a razão social.').max(200),
  trade_name: z.string().trim().max(200).optional().default(''),
  cnpj: cnpj.optional().default(''),
  sector: z.string().trim().max(100).optional().default(''),
  company_size: z.enum(['Micro', 'Pequena', 'Média', '']).optional().default(''),
  employee_count_range: z.enum(['1-9', '10-49', '50-99', '100-249', '250+', '']).optional().default(''),
  contact_email: z.string().trim().toLowerCase().email('E-mail inválido.').or(z.literal('')).optional().default(''),
});

r.get('/companies', (req, res) => {
  const qtext = `%${String(req.query.q || '').trim()}%`;
  res.json(page(
    `SELECT COUNT(*) n FROM companies WHERE legal_name LIKE ? OR trade_name LIKE ? OR cnpj LIKE ?`,
    `SELECT c.*, (SELECT COUNT(*) FROM company_memberships m WHERE m.company_id = c.id AND m.status='ACTIVE') AS active_users,
            (SELECT status FROM assessments a WHERE a.company_id = c.id ORDER BY started_at DESC LIMIT 1) AS last_assessment_status
     FROM companies c WHERE legal_name LIKE ? OR trade_name LIKE ? OR cnpj LIKE ? ORDER BY c.created_at DESC`,
    [qtext, qtext, qtext], req.query));
});

r.post('/companies', (req, res) => {
  const b = parse(companyBody, req.body);
  if (b.cnpj && one('SELECT 1 FROM companies WHERE cnpj = ?', b.cnpj)) throw badRequest('CNPJ já cadastrado.', { cnpj: 'Já existe empresa com este CNPJ.' });
  const id = uuid(), now = nowIso();
  run(`INSERT INTO companies (id, legal_name, trade_name, cnpj, sector, company_size, employee_count_range, contact_email, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, b.legal_name, b.trade_name || null, b.cnpj || null, b.sector || null, b.company_size || null, b.employee_count_range || null, b.contact_email || null, 'ACTIVE', now, now);
  audit(req, 'company.created', { companyId: id, entityType: 'company', entityId: id, metadata: { legal_name: b.legal_name } });
  res.status(201).json(one('SELECT * FROM companies WHERE id = ?', id));
});

r.get('/companies/:id', (req, res) => {
  const c = one('SELECT * FROM companies WHERE id = ?', req.params.id);
  if (!c) throw notFound('Empresa não encontrada.');
  const users = all(`SELECT u.id, u.name, u.email, u.account_status, m.role, m.status AS membership_status FROM company_memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? ORDER BY m.created_at`, c.id);
  const invitations = all(`SELECT id, email, name, role, status, expires_at, created_at, accepted_at FROM invitations WHERE company_id = ? ORDER BY created_at DESC`, c.id);
  const assessments = all(`SELECT a.id, a.status, a.started_at, a.finalized_at, v.version, r.overall_maturity, r.result_status
                           FROM assessments a JOIN instrument_versions v ON v.id = a.instrument_version_id LEFT JOIN assessment_results r ON r.assessment_id = a.id
                           WHERE a.company_id = ? ORDER BY a.started_at DESC`, c.id);
  res.json({ ...c, users, invitations, assessments, ai_usage: usageSummary(c.id) });
});

r.patch('/companies/:id', (req, res) => {
  const c = one('SELECT * FROM companies WHERE id = ?', req.params.id);
  if (!c) throw notFound('Empresa não encontrada.');
  const b = parse(companyBody.partial(), req.body);
  if (b.cnpj && one('SELECT 1 FROM companies WHERE cnpj = ? AND id <> ?', b.cnpj, c.id)) throw badRequest('CNPJ já cadastrado.', { cnpj: 'Já existe empresa com este CNPJ.' });
  const merged = { ...c, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v === '' ? null : v])) };
  run(`UPDATE companies SET legal_name=?, trade_name=?, cnpj=?, sector=?, company_size=?, employee_count_range=?, contact_email=?, updated_at=? WHERE id=?`,
    merged.legal_name, merged.trade_name, merged.cnpj, merged.sector, merged.company_size, merged.employee_count_range, merged.contact_email, nowIso(), c.id);
  audit(req, 'company.updated', { companyId: c.id, entityType: 'company', entityId: c.id, metadata: { fields: Object.keys(b) } });
  res.json(one('SELECT * FROM companies WHERE id = ?', c.id));
});

r.patch('/companies/:id/status', (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }), req.body);
  const c = one('SELECT * FROM companies WHERE id = ?', req.params.id);
  if (!c) throw notFound('Empresa não encontrada.');
  run('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), c.id);
  if (status === 'INACTIVE') {
    // Inativação não apaga histórico (2.6); só encerra sessões dos usuários vinculados.
    for (const m of all(`SELECT user_id FROM company_memberships WHERE company_id = ? AND status = 'ACTIVE'`, c.id)) revokeUserSessions(m.user_id);
  }
  audit(req, status === 'ACTIVE' ? 'company.activated' : 'company.inactivated', { companyId: c.id, entityType: 'company', entityId: c.id });
  res.json({ ok: true });
});

// ---------- Usuários ----------
r.get('/users', (req, res) => {
  const qtext = `%${String(req.query.q || '').trim()}%`;
  res.json(page(
    `SELECT COUNT(*) n FROM users u WHERE (u.name LIKE ? OR u.email LIKE ?)`,
    `SELECT u.id, u.name, u.email, u.account_status, u.is_platform_admin, u.mfa_enabled, u.created_at, m.role, c.id AS company_id, COALESCE(c.trade_name, c.legal_name) AS company_name
     FROM users u LEFT JOIN company_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE' LEFT JOIN companies c ON c.id = m.company_id
     WHERE (u.name LIKE ? OR u.email LIKE ?) ORDER BY u.created_at DESC`,
    [qtext, qtext], req.query));
});

r.patch('/users/:id/status', (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }), req.body);
  const u = one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) throw notFound('Usuário não encontrado.');
  if (u.id === req.user.id) throw badRequest('Você não pode inativar a própria conta.');
  if (status === 'ACTIVE' && !u.password_hash) throw badRequest('O usuário ainda não ativou a conta pelo convite.');
  run('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?', status, nowIso(), u.id);
  if (status === 'INACTIVE') revokeUserSessions(u.id);
  const m = one(`SELECT company_id FROM company_memberships WHERE user_id = ? AND status = 'ACTIVE'`, u.id);
  audit(req, status === 'ACTIVE' ? 'user.activated' : 'user.inactivated', { companyId: m?.company_id, entityType: 'user', entityId: u.id });
  res.json({ ok: true });
});

// Altera o vínculo do usuário com a empresa (papel ou desvinculação)
r.patch('/memberships', (req, res) => {
  const b = parse(z.object({ user_id: z.string(), company_id: z.string(), role: z.enum(['GESTOR', 'TI']).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() }), req.body);
  const m = one('SELECT * FROM company_memberships WHERE user_id = ? AND company_id = ? ORDER BY created_at DESC LIMIT 1', b.user_id, b.company_id);
  if (!m) throw notFound('Vínculo não encontrado.');
  try {
    run('UPDATE company_memberships SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE id = ?', b.role ?? null, b.status ?? null, m.id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw conflict('O usuário já possui outro vínculo ativo.');
    throw e;
  }
  revokeUserSessions(b.user_id);
  audit(req, 'membership.updated', { companyId: b.company_id, entityType: 'membership', entityId: m.id, metadata: { role: b.role, status: b.status } });
  res.json({ ok: true });
});

// ---------- Convites ----------
async function issueInvite(req, companyId, emailAddr, name, role) {
  const company = one('SELECT * FROM companies WHERE id = ?', companyId);
  if (!company) throw notFound('Empresa não encontrada.');
  if (company.status !== 'ACTIVE') throw badRequest('A empresa está inativa.');
  const existingUser = one('SELECT * FROM users WHERE email = ?', emailAddr);
  if (existingUser?.is_platform_admin) throw badRequest('Este e-mail pertence a um administrador.', { email: 'E-mail de administrador.' });
  if (existingUser) {
    const m = one(`SELECT company_id FROM company_memberships WHERE user_id = ? AND status = 'ACTIVE'`, existingUser.id);
    if (m) throw badRequest('Este e-mail já está vinculado a uma empresa.', { email: 'No MVP, cada usuário pertence a uma única empresa.' });
  }
  if (role === 'GESTOR') {
    const g = one(`SELECT 1 FROM company_memberships WHERE company_id = ? AND role = 'GESTOR' AND status = 'ACTIVE'`, companyId);
    const pendingG = one(`SELECT 1 FROM invitations WHERE company_id = ? AND role = 'GESTOR' AND status = 'PENDING' AND expires_at > ? AND email <> ?`, companyId, nowIso(), emailAddr);
    if (g || pendingG) throw badRequest('A empresa já possui um Gestor ativo ou convidado.', { role: 'Apenas um Gestor por empresa.' });
  }
  const token = randomToken();
  tx(() => {
    run(`UPDATE invitations SET status = 'REVOKED' WHERE company_id = ? AND email = ? AND status = 'PENDING'`, companyId, emailAddr);
    run(`INSERT INTO invitations (id, company_id, email, name, role, token_hash, expires_at, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      uuid(), companyId, emailAddr, name || null, role, sha256(token), addMinutes(config.inviteHours * 60), 'PENDING', req.user.id, nowIso());
  });
  const link = `${config.baseUrl}/ativar.html#token=${token}`;
  const mail = inviteMail({ name, companyName: company.trade_name || company.legal_name, role, link, hours: config.inviteHours });
  const sent = await sendMail({ to: emailAddr, ...mail });
  audit(req, 'invitation.sent', { companyId, entityType: 'invitation', metadata: { email: emailAddr, role } });
  // Em desenvolvimento/homologação sem SMTP, o link é devolvido ao administrador para repasse manual.
  return { ok: true, delivered: sent.delivered, activation_link: sent.delivered || config.env === 'production' ? undefined : link };
}

r.post('/invitations', async (req, res) => {
  const b = parse(z.object({
    company_id: z.string().min(1, 'Selecione a empresa.'),
    email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
    name: z.string().trim().max(120).optional(),
    role: z.enum(['GESTOR', 'TI'], { message: 'Perfil deve ser Gestor ou Responsável de TI.' }),
  }), req.body);
  res.status(201).json(await issueInvite(req, b.company_id, b.email, b.name, b.role));
});

r.post('/invitations/:id/resend', async (req, res) => {
  const inv = one('SELECT * FROM invitations WHERE id = ?', req.params.id);
  if (!inv) throw notFound('Convite não encontrado.');
  if (inv.status === 'ACCEPTED') throw badRequest('O convite já foi aceito.');
  res.json(await issueInvite(req, inv.company_id, inv.email, inv.name, inv.role));
});

r.post('/invitations/:id/revoke', (req, res) => {
  const inv = one('SELECT * FROM invitations WHERE id = ?', req.params.id);
  if (!inv) throw notFound('Convite não encontrado.');
  if (inv.status !== 'PENDING') throw badRequest('Somente convites pendentes podem ser revogados.');
  run(`UPDATE invitations SET status = 'REVOKED' WHERE id = ?`, inv.id);
  audit(req, 'invitation.revoked', { companyId: inv.company_id, entityType: 'invitation', entityId: inv.id });
  res.json({ ok: true });
});

// ---------- Questionário (versões, dimensões, perguntas, alternativas, referências) ----------
r.get('/instrument-versions', (_req, res) => res.json({ items: instrument.listVersions() }));
r.get('/instrument-versions/:id', (req, res) => res.json(instrument.getVersionFull(req.params.id)));

r.post('/instrument-versions/:id/clone', (req, res) => {
  const { version } = parse(z.object({ version: z.string().trim().regex(/^\d+\.\d+$/, 'Use o formato 1.1, 2.0...') }), req.body);
  const id = instrument.cloneVersion(req.params.id, version);
  audit(req, 'instrument.version_created', { entityType: 'instrument_version', entityId: id, metadata: { from: req.params.id, version } });
  res.status(201).json({ id });
});

r.patch('/instrument-versions/:vid/dimensions/:did', (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().max(500).optional() }), req.body);
  instrument.updateDimension(req.params.vid, req.params.did, b);
  audit(req, 'instrument.dimension_updated', { entityType: 'dimension', entityId: req.params.did });
  res.json({ ok: true });
});

const txt = (max = 2000) => z.string().max(max).optional();
r.patch('/instrument-versions/:vid/questions/:qid', (req, res) => {
  const b = parse(z.object({
    theme: txt(120), title: z.string().trim().min(5, 'Informe o texto da pergunta.').max(500).optional(), explanation: txt(), evidence_guidance: txt(),
    verification_guidance: txt(), no_file_guidance: txt(), privacy_guidance: txt(), applicability_note: txt(), first_recommendation: txt(),
    primary_framework: txt(40), dimension_id: z.string().optional(),
    options: z.array(z.object({ score: z.number().int().min(0).max(4), description: z.string().trim().min(2).max(500) })).optional(),
    references: z.array(z.object({ framework_name: z.string().min(2).max(40), version: z.string().max(40).nullable().optional(), reference_code: z.string().min(2).max(200), source_url: z.string().url().nullable().optional() })).optional(),
  }), req.body);
  instrument.updateQuestion(req.params.vid, req.params.qid, b);
  audit(req, 'instrument.question_updated', { entityType: 'question', entityId: req.params.qid, metadata: { fields: Object.keys(b) } });
  res.json({ ok: true });
});

r.post('/instrument-versions/:id/publish', (req, res) => {
  instrument.publishVersion(req.params.id);
  audit(req, 'instrument.version_published', { entityType: 'instrument_version', entityId: req.params.id });
  res.json({ ok: true });
});

// ---------- Acompanhamento de avaliações e relatórios ----------
r.get('/assessments', (req, res) => {
  res.json(page(
    'SELECT COUNT(*) n FROM assessments',
    `SELECT a.id, a.status, a.started_at, a.finalized_at, COALESCE(c.trade_name, c.legal_name) AS company_name, c.id AS company_id, v.version,
            r.overall_maturity, r.overall_classification, r.result_status,
            (SELECT COUNT(*) FROM assessment_answers x WHERE x.assessment_id = a.id) AS answered,
            (SELECT COUNT(*) FROM ai_reports y WHERE y.assessment_id = a.id) AS reports
     FROM assessments a JOIN companies c ON c.id = a.company_id JOIN instrument_versions v ON v.id = a.instrument_version_id
     LEFT JOIN assessment_results r ON r.assessment_id = a.id ORDER BY a.started_at DESC`, [], req.query));
});

r.get('/report-jobs', (req, res) => {
  res.json(page('SELECT COUNT(*) n FROM ai_report_jobs',
    `SELECT j.id, j.status, j.attempt_count, j.requested_at, j.finished_at, j.error_code, COALESCE(c.trade_name, c.legal_name) AS company_name
     FROM ai_report_jobs j JOIN companies c ON c.id = j.company_id ORDER BY j.requested_at DESC`, [], req.query));
});

// ---------- Auditoria e consumo de IA ----------
r.get('/audit-logs', (req, res) => {
  const action = `%${String(req.query.action || '')}%`;
  const company = req.query.company_id ? String(req.query.company_id) : null;
  res.json(page(
    `SELECT COUNT(*) n FROM audit_logs WHERE action LIKE ? AND (? IS NULL OR company_id = ?)`,
    `SELECT l.*, u.email AS actor_email FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
     WHERE l.action LIKE ? AND (? IS NULL OR l.company_id = ?) ORDER BY l.created_at DESC`,
    [action, company, company], req.query));
});

r.get('/ai-usage', (req, res) => {
  const list = page('SELECT COUNT(*) n FROM ai_usage',
    `SELECT a.*, COALESCE(c.trade_name, c.legal_name) AS company_name FROM ai_usage a JOIN companies c ON c.id = a.company_id ORDER BY a.created_at DESC`, [], req.query);
  const month = one(`SELECT COALESCE(SUM(input_tokens),0) input_tokens, COALESCE(SUM(output_tokens),0) output_tokens, COALESCE(SUM(estimated_cost),0) cost, COUNT(*) calls
                     FROM ai_usage WHERE created_at >= ?`, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString());
  res.json({ ...list, month, limits: { reports_per_company: config.ai.monthlyReportsPerCompany, tokens_per_company: config.ai.monthlyTokensPerCompany, tokens_global: config.ai.monthlyTokensGlobal }, provider: config.ai.provider, model: config.ai.provider === 'anthropic' ? config.ai.model : 'prismati-local-1.0' });
});

export default r;
