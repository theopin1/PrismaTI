// Relatórios por IA: fila assíncrona, validação, versionamento, consumo e limites (Seção 7, RF-044 a RF-056).
import { config } from '../config.js';
import { one, all, run, tx } from '../db.js';
import { uuid, nowIso } from '../lib/util.js';
import { conflict, notFound, tooMany } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { getResults, getQuestionBreakdown } from './assessments.js';
import { getVersionFull } from './instrument.js';
import { validateReport, PROMPT_VERSION, OUTPUT_SCHEMA_VERSION } from './ai/schema.js';
import { generateLocal } from './ai/local-provider.js';
import { generateWithAnthropic } from './ai/anthropic-provider.js';
import { round2 } from './calculation.js';

// Provedores substituíveis (RNF-045). Testes podem injetar um provedor que falha.
const providers = { local: generateLocal, anthropic: generateWithAnthropic };
let overrideProvider = null;
export const setProviderForTests = (fn) => { overrideProvider = fn; };
const providerName = () => (overrideProvider ? 'test' : config.ai.provider);

// 7.2 — somente os dados necessários; anexos nunca são enviados, apenas sua existência.
export function buildPayload(assessment) {
  const company = one('SELECT sector, company_size, employee_count_range FROM companies WHERE id = ?', assessment.company_id);
  const results = getResults(assessment);
  const version = getVersionFull(assessment.instrument_version_id);
  const guidance = Object.fromEntries(version.questions.map((q) => [q.code, q]));
  const evidenceText = all(`SELECT q.code, e.evidence_type, e.description FROM evidences e
                            JOIN assessment_answers aa ON aa.id = e.assessment_answer_id JOIN questions q ON q.id = aa.question_id
                            WHERE aa.assessment_id = ?`, assessment.id);
  const evBy = evidenceText.reduce((m, e) => ((m[e.code] ||= []).push(e.evidence_type === 'FILE' ? '[arquivo anexado, não analisado]' : (e.description || '[evidência declarada]').slice(0, 500)), m), {});
  return {
    company: { sector: company?.sector || 'não informado', size: company?.company_size || 'não informado', employees: company?.employee_count_range || 'não informado' },
    assessment: { instrument_version: version.version, calculation_version: results.calculation_version, finalized_at: assessment.finalized_at },
    methodology: {
      scale: '0 inexistente, 1 informal/reativa, 2 parcial, 3 estabelecida, 4 monitorada e melhorada',
      bands: '0–20 Muito inicial; >20–40 Inicial; >40–60 Em desenvolvimento; >60–80 Estabelecido; >80–100 Avançado',
      sufficiency: 'Apto à revisão: cobertura ≥ 80% e todas as dimensões com nota; Preliminar: caso contrário; Sem dados suficientes: nenhuma nota',
    },
    results: {
      overall_maturity: round2(results.overall_maturity),
      overall_classification: results.overall_classification,
      overall_coverage: round2(results.overall_coverage),
      fill_percentage: round2(results.fill_percentage),
      result_status: results.result_status,
      counts: { scored: results.scored_count, na: results.na_count, ns: results.ns_count, total: results.total_questions },
      dimensions_without_data: results.dimensions.filter((d) => d.result_status === 'INDISPONIVEL').map((d) => d.code),
      dimensions: results.dimensions.map((d) => ({ code: d.code, name: d.name, maturity_percentage: round2(d.maturity_percentage), classification: d.classification, coverage_percentage: round2(d.coverage_percentage) })),
    },
    questions: getQuestionBreakdown(assessment).map((q) => ({
      code: q.code, dimension_code: q.dimension_code, theme: q.theme, question: q.title,
      answer_type: q.answer_type, score: q.score, selected_option: q.selected_option,
      na_justification: q.answer_type === 'NA' ? q.justification : undefined,
      evidence_status: q.evidence_status, evidence_notes: evBy[q.code],
      first_recommendation: q.first_recommendation, evidence_guidance: guidance[q.code]?.evidence_guidance,
      references: q.references,
    })),
  };
}

function monthStart() { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); }

// RF-056 / RNF-034 — limites configuráveis
export function usageSummary(companyId) {
  const since = monthStart();
  const company = one(`SELECT COUNT(*) AS reports FROM ai_report_jobs WHERE company_id = ? AND requested_at >= ?`, companyId, since);
  const tokens = one(`SELECT COALESCE(SUM(input_tokens + output_tokens),0) AS t, COALESCE(SUM(estimated_cost),0) AS cost FROM ai_usage WHERE company_id = ? AND created_at >= ?`, companyId, since);
  const global = one(`SELECT COALESCE(SUM(input_tokens + output_tokens),0) AS t FROM ai_usage WHERE created_at >= ?`, since);
  return {
    period_start: since,
    reports_this_month: company.reports, reports_limit: config.ai.monthlyReportsPerCompany,
    tokens_this_month: tokens.t, tokens_limit: config.ai.monthlyTokensPerCompany, estimated_cost_usd: round2(tokens.cost),
    global_tokens_this_month: global.t, global_tokens_limit: config.ai.monthlyTokensGlobal,
  };
}

function assertWithinLimits(companyId) {
  const u = usageSummary(companyId);
  if (u.reports_this_month >= u.reports_limit) throw tooMany(`Limite mensal de ${u.reports_limit} relatórios por empresa atingido. Fale com o suporte PrismaTI.`);
  if (u.tokens_this_month >= u.tokens_limit || u.global_tokens_this_month >= u.global_tokens_limit) throw tooMany('Limite de consumo de IA atingido neste mês. Fale com o suporte PrismaTI.');
}

export function requestReport(assessment, user) {
  if (assessment.status !== 'FINALIZED') throw conflict('O relatório só pode ser solicitado após a finalização da avaliação.');
  assertWithinLimits(assessment.company_id);
  const id = uuid();
  try {
    run(`INSERT INTO ai_report_jobs (id, assessment_id, company_id, requested_by, status, attempt_count, requested_at) VALUES (?,?,?,?,?,?,?)`,
      id, assessment.id, assessment.company_id, user.id, 'QUEUED', 0, nowIso());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw conflict('Já existe um relatório em processamento para esta avaliação.', 'REPORT_IN_PROGRESS');
    throw e;
  }
  kick();
  return one('SELECT * FROM ai_report_jobs WHERE id = ?', id);
}

// RF-048 — nova tentativa controlada, só para jobs com falha e dentro do limite de tentativas
export function retryJob(job) {
  if (job.status !== 'FAILED') throw conflict('Somente solicitações com falha podem ser repetidas.');
  if (job.attempt_count >= config.ai.maxAttempts) throw conflict(`Número máximo de ${config.ai.maxAttempts} tentativas atingido. Solicite um novo relatório.`, 'MAX_ATTEMPTS');
  assertWithinLimits(job.company_id);
  try {
    run(`UPDATE ai_report_jobs SET status = 'QUEUED', error_code = NULL, error_message = NULL, finished_at = NULL WHERE id = ? AND status = 'FAILED'`, job.id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw conflict('Já existe um relatório em processamento para esta avaliação.', 'REPORT_IN_PROGRESS');
    throw e;
  }
  kick();
  return one('SELECT * FROM ai_report_jobs WHERE id = ?', job.id);
}

function recordUsage(job, provider, model, usage, status) {
  const cost = ((usage.input_tokens || 0) * config.ai.priceInputPerMTok + (usage.output_tokens || 0) * config.ai.priceOutputPerMTok) / 1_000_000;
  run(`INSERT INTO ai_usage (id, company_id, user_id, report_job_id, provider, model, input_tokens, output_tokens, estimated_cost, currency, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, uuid(), job.company_id, job.requested_by, job.id, provider, model, usage.input_tokens || 0, usage.output_tokens || 0,
  provider === 'local' ? 0 : cost, 'USD', status, nowIso());
}

export async function processJob(jobId) {
  // Reserva o job (evita processamento duplicado)
  const claimed = run(`UPDATE ai_report_jobs SET status = 'PROCESSING', started_at = ?, attempt_count = attempt_count + 1 WHERE id = ? AND status = 'QUEUED'`, nowIso(), jobId);
  if (!claimed.changes) return;
  const job = one('SELECT * FROM ai_report_jobs WHERE id = ?', jobId);
  const assessment = one('SELECT * FROM assessments WHERE id = ?', job.assessment_id);
  const pname = providerName();
  const generate = overrideProvider || providers[pname];
  let usage = { input_tokens: 0, output_tokens: 0 };
  let model = pname === 'anthropic' ? config.ai.model : 'prismati-local-1.0';
  try {
    if (!generate) throw Object.assign(new Error(`Provedor de IA desconhecido: ${pname}`), { code: 'AI_CONFIG' });
    const before = JSON.stringify(getResults(assessment)); // integridade: resultados oficiais não podem mudar
    const payload = buildPayload(assessment);
    const out = await generate(payload);
    usage = out.usage || usage; model = out.model || model;
    const version = getVersionFull(assessment.instrument_version_id);
    const v = validateReport(out.content, { questionCodes: version.questions.map((q) => q.code), dimensionCodes: version.dimensions.map((d) => d.code) });
    if (!v.ok) throw Object.assign(new Error(v.error), { code: 'AI_INVALID_OUTPUT' });
    if (JSON.stringify(getResults(assessment)) !== before) throw Object.assign(new Error('Resultados oficiais alterados durante a geração.'), { code: 'INTEGRITY' });
    tx(() => {
      const next = one('SELECT COALESCE(MAX(report_version),0) + 1 AS v FROM ai_reports WHERE assessment_id = ?', assessment.id).v;
      run(`INSERT INTO ai_reports (id, assessment_id, company_id, report_job_id, report_version, content, model_name, provider, prompt_version, output_schema_version, generated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`, uuid(), assessment.id, assessment.company_id, job.id, next, JSON.stringify(v.data), model, pname, PROMPT_VERSION, OUTPUT_SCHEMA_VERSION, nowIso());
      run(`UPDATE ai_report_jobs SET status = 'COMPLETED', finished_at = ? WHERE id = ?`, nowIso(), job.id);
    });
    recordUsage(job, pname, model, usage, 'SUCCESS');
    log.info('report.completed', { jobId: job.id, provider: pname, model });
  } catch (e) {
    usage = e.usage || usage;
    // A falha nunca altera respostas ou resultados numéricos (RNF-035, CA-MVP-16)
    run(`UPDATE ai_report_jobs SET status = 'FAILED', finished_at = ?, error_code = ?, error_message = ? WHERE id = ?`,
      nowIso(), e.code || 'AI_ERROR', String(e.message).slice(0, 300), job.id);
    recordUsage(job, pname, model, usage, 'FAILED');
    log.error('report.failed', { jobId: job.id, errorCode: e.code || 'AI_ERROR', message: String(e.message).slice(0, 300) });
  }
}

// ---- Worker em processo (assíncrono, RNF-023) ----
let timer = null, running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = one(`SELECT id FROM ai_report_jobs WHERE status = 'QUEUED' ORDER BY requested_at LIMIT 1`);
      if (!next) break;
      await processJob(next.id);
    }
  } finally { running = false; }
}
export function kick() { setImmediate(() => tick().catch((e) => log.error('worker.error', { message: e.message }))); }
export function startWorker() {
  // Recuperação controlada (RNF-025): jobs interrompidos por queda do servidor voltam para a fila.
  const r = run(`UPDATE ai_report_jobs SET status = 'QUEUED' WHERE status = 'PROCESSING'`);
  if (r.changes) log.warn('worker.recovered', { jobs: r.changes });
  timer = setInterval(() => tick().catch(() => {}), config.ai.workerIntervalMs);
  timer.unref();
  kick();
}
export function stopWorker() { if (timer) clearInterval(timer); timer = null; }
export async function drainQueue() { await tick(); }

export function listJobs(assessmentId) {
  return all('SELECT id, status, attempt_count, requested_at, started_at, finished_at, error_code FROM ai_report_jobs WHERE assessment_id = ? ORDER BY requested_at DESC', assessmentId);
}
export function listReports(assessmentId) {
  return all('SELECT id, report_version, model_name, provider, prompt_version, output_schema_version, generated_at, report_job_id FROM ai_reports WHERE assessment_id = ? ORDER BY report_version DESC', assessmentId);
}
export function getReportRow(reportId) {
  const r = one('SELECT * FROM ai_reports WHERE id = ?', reportId);
  if (!r) throw notFound('Relatório não encontrado.');
  return r;
}
