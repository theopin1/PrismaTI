// Testes de integração dos critérios de aceitação do MVP (Seção 10.5).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, PNG, PDF_OK, PDF_JS } from './helpers.js';

let srv, admin, gA, tiA, gB, A = {}, B = {};
const API = '/api/v1';
const tokenOf = (link) => link.split('#token=')[1];

async function createCompanyWithUsers(name, cnpj) {
  const c = await admin.post(`${API}/admin/companies`, { legal_name: name, trade_name: name, cnpj, sector: 'Comércio', company_size: 'Pequena', employee_count_range: '10-49' });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const out = { id: c.data.id };
  for (const [role, email] of [['GESTOR', `gestor@${cnpj}.test`], ['TI', `ti@${cnpj}.test`]]) {
    const inv = await admin.post(`${API}/admin/invitations`, { company_id: c.data.id, email, name: role, role });
    assert.equal(inv.status, 201, JSON.stringify(inv.data));
    out[role] = { email, token: tokenOf(inv.data.activation_link) };
  }
  return out;
}

async function activateAndLogin(info, name) {
  const u = client(srv.base);
  const act = await u.post(`${API}/auth/activate`, { token: info.token, name, password: 'SenhaForte123' });
  assert.equal(act.status, 200, JSON.stringify(act.data));
  const l = await u.login(info.email, 'SenhaForte123');
  assert.equal(l.status, 200);
  return u;
}

let questions;

before(async () => {
  srv = await startTestServer();
  admin = client(srv.base);
  assert.equal((await admin.login('admin@prismati.test', 'AdminSenha123')).status, 200);
  A = await createCompanyWithUsers('Empresa A', '11222333000181');
  B = await createCompanyWithUsers('Empresa B', '11444777000161');
});
after(async () => { await srv.close(); });

test('CA-MVP-01 · empresa cadastrada pelo admin e usuários convidados ativam a conta', async () => {
  const pub = client(srv.base);
  const prev = await pub.get(`${API}/auth/invitation?token=${A.GESTOR.token}`);
  assert.equal(prev.status, 200);
  assert.equal(prev.data.company, 'Empresa A');
  gA = await activateAndLogin(A.GESTOR, 'Gestora A');
  tiA = await activateAndLogin(A.TI, 'TI A');
  gB = await activateAndLogin(B.GESTOR, 'Gestor B');
  const me = await gA.get(`${API}/auth/me`);
  assert.equal(me.data.role, 'GESTOR');
  assert.equal(me.data.company.name, 'Empresa A');
});

test('Convite é de uso único e não há cadastro público', async () => {
  const u = client(srv.base);
  const again = await u.post(`${API}/auth/activate`, { token: A.GESTOR.token, name: 'X', password: 'SenhaForte123' });
  assert.equal(again.status, 400);
  const bogus = await u.post(`${API}/auth/register`, { email: 'x@x.com' });
  assert.ok([401, 404].includes(bogus.status));
  assert.equal((await u.post(`${API}/admin/companies`, { legal_name: 'Pirata' })).status, 401);
});

test('Senha fraca é rejeitada com o campo identificado (RNF-052)', async () => {
  const inv = await admin.post(`${API}/admin/invitations`, { company_id: A.id, email: 'fraca@a.test', role: 'TI' });
  const u = client(srv.base);
  const r = await u.post(`${API}/auth/activate`, { token: tokenOf(inv.data.activation_link), name: 'Fraca', password: '123' });
  assert.equal(r.status, 400);
  assert.ok(r.data.error.fields.password);
});

test('CA-MVP-02 · controle de acesso por perfil', async () => {
  assert.equal((await gA.get(`${API}/admin/companies`)).status, 403);
  assert.equal((await client(srv.base).get(`${API}/assessments`)).status, 401);
  assert.equal((await admin.get(`${API}/admin/companies?page=1&pageSize=1`)).data.items.length, 1); // paginação RNF-048
});

test('Mutação sem cabeçalho anti-CSRF é bloqueada', async () => {
  const r = await gA.post(`${API}/assessments`, {}, { csrf: false });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, 'CSRF');
});

test('CA-MVP-04 · uma única avaliação em andamento por empresa, mesmo sob concorrência', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => gA.post(`${API}/assessments`, {})));
  const ids = new Set(results.map((r) => r.data.id));
  assert.equal(ids.size, 1);
  A.assessment = [...ids][0];
  const list = await gA.get(`${API}/assessments`);
  assert.equal(list.data.items.filter((a) => a.status === 'IN_PROGRESS').length, 1);
  const v = await gA.get(`${API}/instruments`);
  const q = await gA.get(`${API}/instrument-versions/${v.data.published_version.id}/questions`);
  questions = q.data.questions;
  assert.equal(questions.length, 30);
  assert.equal(q.data.dimensions.length, 7);
  assert.ok(questions.every((x) => x.options.length === 5 && x.evidence_guidance && x.explanation)); // RNF-054
});

test('CA-MVP-03 · Responsável de TI consulta, mas não edita nem finaliza', async () => {
  assert.equal((await tiA.get(`${API}/assessments/${A.assessment}`)).status, 200);
  assert.equal((await tiA.put(`${API}/assessments/${A.assessment}/answers/${questions[0].id}`, { type: 'SCORE', score: 2 })).status, 403);
  assert.equal((await tiA.post(`${API}/assessments/${A.assessment}/finalize`, {})).status, 403);
  assert.equal((await tiA.post(`${API}/assessments`, {})).status, 403);
});

test('CA-MVP-05 · respostas salvas permanecem após novo acesso', async () => {
  const r = await gA.put(`${API}/assessments/${A.assessment}/answers/${questions[0].id}`, { type: 'SCORE', score: 3 });
  assert.equal(r.status, 200);
  await gA.post(`${API}/auth/logout`, {});
  assert.equal((await gA.get(`${API}/assessments/${A.assessment}`)).status, 401);
  await gA.login(A.GESTOR.email, 'SenhaForte123');
  const d = await gA.get(`${API}/assessments/${A.assessment}`);
  assert.equal(d.data.answers[questions[0].id].score, 3);
  assert.equal(d.data.progress.answered, 1);
});

test('Alternativa inválida é rejeitada ao salvar', async () => {
  assert.equal((await gA.put(`${API}/assessments/${A.assessment}/answers/${questions[1].id}`, { type: 'SCORE', score: 9 })).status, 400);
  assert.equal((await gA.put(`${API}/assessments/${A.assessment}/answers/${questions[1].id}`, { type: 'XX' })).status, 400);
});

test('CA-MVP-07 · evidências: registro, validação de arquivos e acesso privado', async () => {
  const q = questions[0].id;
  const fd = (buf, type, name) => { const f = new FormData(); f.append('evidence_type', 'FILE'); f.append('file', new Blob([buf], { type }), name); return f; };
  const ok = await gA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, fd(PNG, 'image/png', 'print.png'));
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  A.evidence = ok.data.id;
  assert.equal((await gA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, fd(PDF_OK, 'application/pdf', 'doc.pdf'))).status, 201);
  // tipo falso (texto declarado como PNG), formato não permitido e PDF com JavaScript são rejeitados
  assert.equal((await gA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, fd(Buffer.from('oi'), 'image/png', 'x.png'))).status, 400);
  assert.equal((await gA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, fd(Buffer.from('MZ'), 'application/x-msdownload', 'x.exe'))).status, 400);
  assert.equal((await gA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, fd(PDF_JS, 'application/pdf', 'x.pdf'))).status, 400);
  const text = new FormData(); text.append('evidence_type', 'TEXT'); text.append('description', 'Planilha de responsáveis no drive.');
  assert.equal((await gA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, text)).status, 201);
  // TI pode consultar e baixar; não pode anexar
  const list = await tiA.get(`${API}/assessments/${A.assessment}/answers/${q}/evidences`);
  assert.equal(list.data.items.length, 3);
  assert.equal(list.data.status, 'ENVIADA');
  const dl = await tiA.get(`${API}/evidences/${A.evidence}/download`, { raw: true });
  assert.equal(dl.status, 200);
  assert.ok(Buffer.from(await dl.arrayBuffer()).equals(PNG));
  assert.equal((await tiA.post(`${API}/assessments/${A.assessment}/answers/${q}/evidences`, text)).status, 403);
  // arquivos não ficam acessíveis pela pasta pública
  assert.notEqual((await client(srv.base).get('/storage/evidences', { raw: true })).status, 200);
});

test('CA-MVP-18 · uma empresa não acessa avaliação, arquivos ou relatórios de outra', async () => {
  assert.equal((await gB.get(`${API}/assessments/${A.assessment}`)).status, 404);
  assert.equal((await gB.get(`${API}/assessments/${A.assessment}/results`)).status, 404);
  assert.equal((await gB.put(`${API}/assessments/${A.assessment}/answers/${questions[2].id}`, { type: 'NS' })).status, 404);
  assert.equal((await gB.get(`${API}/evidences/${A.evidence}/download`)).status, 404);
  assert.equal((await gB.del(`${API}/evidences/${A.evidence}`)).status, 404);
});

test('CA-MVP-06 · finalização rejeita perguntas sem resposta e NA sem justificativa', async () => {
  // responde todas: notas variadas, 1 NA sem justificativa, 2 NS
  for (const [i, q] of questions.entries()) {
    let body = { type: 'SCORE', score: i % 5 };
    if (i === 5) body = { type: 'NA' };
    if (i === 10 || i === 20) body = { type: 'NS' };
    if (i === 29) continue; // deixa uma sem resposta
    assert.equal((await gA.put(`${API}/assessments/${A.assessment}/answers/${q.id}`, body)).status, 200);
  }
  const f1 = await gA.post(`${API}/assessments/${A.assessment}/finalize`, {});
  assert.equal(f1.status, 400);
  assert.ok(f1.data.error.fields.P06.includes('justificativa'));
  assert.ok(f1.data.error.fields.P30);
  await gA.put(`${API}/assessments/${A.assessment}/answers/${questions[5].id}`, { type: 'NA', justification: 'Não utilizamos dados pessoais de clientes.' });
  await gA.put(`${API}/assessments/${A.assessment}/answers/${questions[29].id}`, { type: 'SCORE', score: 4 });
});

test('CA-MVP-08/09/10 · finalização bloqueia respostas e armazena resultados consistentes', async () => {
  const [f1, f2] = await Promise.all([gA.post(`${API}/assessments/${A.assessment}/finalize`, {}), gA.post(`${API}/assessments/${A.assessment}/finalize`, {})]);
  assert.equal(f1.status, 200); assert.equal(f2.status, 200);
  assert.ok(f1.data.already_finalized !== f2.data.already_finalized, 'uma das chamadas deve ser idempotente');
  const res = await gA.get(`${API}/assessments/${A.assessment}/results`);
  assert.equal(res.data.total_questions, 30);
  assert.equal(res.data.na_count, 1); assert.equal(res.data.ns_count, 2); assert.equal(res.data.scored_count, 27);
  assert.equal(Math.round(res.data.overall_coverage * 100) / 100, Math.round((27 / 29) * 10000) / 100);
  assert.equal(res.data.dimensions.length, 7);
  assert.equal(res.data.result_status, 'APTO_REVISAO');
  // recálculo manual da média simples
  const avg = res.data.dimensions.reduce((s, d) => s + d.maturity_percentage, 0) / 7;
  assert.ok(Math.abs(avg - res.data.overall_maturity) < 1e-9);
  // bloqueio
  assert.equal((await gA.put(`${API}/assessments/${A.assessment}/answers/${questions[0].id}`, { type: 'SCORE', score: 4 })).status, 409);
  assert.equal((await gA.del(`${API}/evidences/${A.evidence}`)).status, 409);
});

test('CA-MVP-10 · cobertura insuficiente gera diagnóstico preliminar', async () => {
  const s = await gB.post(`${API}/assessments`, {});
  B.assessment = s.data.id;
  for (const [i, q] of questions.entries()) await gB.put(`${API}/assessments/${B.assessment}/answers/${q.id}`, i < 12 ? { type: 'NS' } : { type: 'SCORE', score: 1 });
  const f = await gB.post(`${API}/assessments/${B.assessment}/finalize`, {});
  assert.equal(f.status, 200);
  assert.equal(f.data.results.result_status, 'PRELIMINAR');
  assert.ok(f.data.results.dimensions.some((d) => d.maturity_percentage === null));
});

test('CA-MVP-11/12/13/14 · relatório por IA assíncrono, rastreável, com roadmap e sem alterar resultados', async () => {
  const before = (await gA.get(`${API}/assessments/${A.assessment}/results`)).data;
  assert.equal((await tiA.post(`${API}/assessments/${A.assessment}/reports`, {})).status, 403);
  const job = await gA.post(`${API}/assessments/${A.assessment}/reports`, {});
  assert.equal(job.status, 202);
  assert.equal(job.data.status, 'QUEUED');
  const { drainQueue } = await import('../src/services/reports.js');
  await drainQueue();
  const j = await gA.get(`${API}/report-jobs/${job.data.id}`);
  assert.equal(j.data.status, 'COMPLETED');
  const list = await gA.get(`${API}/assessments/${A.assessment}/reports`);
  assert.equal(list.data.reports.length, 1);
  const rep = await tiA.get(`${API}/reports/${list.data.reports[0].id}`);
  assert.equal(rep.status, 200);
  const c = rep.data.content;
  assert.ok(c.recommendations.length > 0);
  const codes = new Set(questions.map((q) => q.code));
  assert.ok(c.recommendations.every((r) => r.question_codes.length && r.question_codes.every((x) => codes.has(x)) && r.priority_justification));
  assert.ok(c.roadmap.length && c.roadmap.every((p) => p.phase && p.period && Array.isArray(p.actions)));
  assert.ok(c.action_plan.every((a) => a.steps.length && a.executor_profile && a.completion_evidence));
  // NA não vira fragilidade; NS aparece nas limitações
  assert.ok(!c.weaknesses.some((w) => w.question_codes.includes('P06')));
  assert.ok(c.limitations.some((l) => l.includes('P11')));
  const pick = (x) => ({ overall: x.overall_maturity, coverage: x.overall_coverage, status: x.result_status, calculated_at: x.calculated_at, dims: x.dimensions });
  assert.deepEqual(pick(rep.data.official_results), pick(before));
  assert.equal(rep.data.provider, 'local');
  assert.ok(rep.data.prompt_version && rep.data.output_schema_version && rep.data.model_name); // RNF-036
  A.report = list.data.reports[0].id;
  // B não acessa o relatório de A
  assert.equal((await gB.get(`${API}/reports/${A.report}`)).status, 404);
  assert.equal((await gB.get(`${API}/reports/${A.report}/pdf`)).status, 404);
});

test('CA-MVP-15 · exportação em PDF legível (Gestor e Responsável de TI)', async () => {
  const res = await gA.get(`${API}/reports/${A.report}/pdf`, { raw: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 5000);
  const tiPdf = await tiA.get(`${API}/reports/${A.report}/pdf?inline=1`, { raw: true });
  assert.equal(tiPdf.status, 200);
  assert.ok(String(tiPdf.headers.get('content-disposition')).startsWith('inline;'));
  assert.equal((await gA.get(`${API}/reports`)).data.items.length, 1);
});

test('CA-MVP-16 · falha da IA mantém o diagnóstico e permite nova tentativa controlada', async () => {
  const R = await import('../src/services/reports.js');
  R.setProviderForTests(async () => { throw Object.assign(new Error('provedor fora do ar'), { code: 'AI_UNAVAILABLE', usage: { input_tokens: 10, output_tokens: 0 } }); });
  const job = await gA.post(`${API}/assessments/${A.assessment}/reports`, {});
  await R.drainQueue();
  let j = await gA.get(`${API}/report-jobs/${job.data.id}`);
  assert.equal(j.data.status, 'FAILED');
  assert.equal(j.data.can_retry, true);
  assert.equal((await gA.get(`${API}/assessments/${A.assessment}/results`)).status, 200);
  // saída inválida (cita pergunta inexistente) também é rejeitada
  R.setProviderForTests(async (payload) => {
    const { generateLocal } = await import('../src/services/ai/local-provider.js');
    const out = await generateLocal(payload);
    out.content.recommendations[0].question_codes = ['P99'];
    return out;
  });
  await gA.post(`${API}/report-jobs/${job.data.id}/retry`, {});
  await R.drainQueue();
  j = await gA.get(`${API}/report-jobs/${job.data.id}`);
  assert.equal(j.data.status, 'FAILED');
  assert.equal(j.data.error_code, 'AI_INVALID_OUTPUT');
  R.setProviderForTests(null);
  await gA.post(`${API}/report-jobs/${job.data.id}/retry`, {});
  await R.drainQueue();
  j = await gA.get(`${API}/report-jobs/${job.data.id}`);
  assert.equal(j.data.status, 'COMPLETED');
  assert.equal(j.data.attempt_count, 3);
  const list = await gA.get(`${API}/assessments/${A.assessment}/reports`);
  assert.deepEqual(list.data.reports.map((r) => r.report_version), [2, 1]); // versões preservadas
});

test('CA-MVP-19 · consumo de IA registrado e limites aplicados', async () => {
  const usage = await admin.get(`${API}/admin/ai-usage`);
  assert.ok(usage.data.total >= 4);
  assert.ok(usage.data.items.some((u) => u.status === 'FAILED' && u.input_tokens === 10));
  const { config } = await import('../src/config.js');
  const old = config.ai.monthlyReportsPerCompany;
  config.ai.monthlyReportsPerCompany = 2;
  const r = await gA.post(`${API}/assessments/${A.assessment}/reports`, {});
  assert.equal(r.status, 429);
  config.ai.monthlyReportsPerCompany = old;
});

test('CA-MVP-17 · histórico: nova avaliação após a finalizada, anterior preservada', async () => {
  const s = await gA.post(`${API}/assessments`, {});
  assert.equal(s.status, 201);
  assert.notEqual(s.data.id, A.assessment);
  const list = await gA.get(`${API}/assessments`);
  assert.equal(list.data.items.length, 2);
  const old = list.data.items.find((a) => a.id === A.assessment);
  assert.equal(old.status, 'FINALIZED');
  assert.equal(old.reports, 2);
});

test('Versionamento: versão publicada não é editável; nova versão não altera avaliações anteriores', async () => {
  const versions = (await admin.get(`${API}/admin/instrument-versions`)).data.items;
  const v1 = versions[0];
  const full = (await admin.get(`${API}/admin/instrument-versions/${v1.id}`)).data;
  assert.equal((await admin.patch(`${API}/admin/instrument-versions/${v1.id}/questions/${full.questions[0].id}`, { title: 'Mudou?' })).status, 409);
  const clone = await admin.post(`${API}/admin/instrument-versions/${v1.id}/clone`, { version: '1.1' });
  assert.equal(clone.status, 201);
  const v2 = (await admin.get(`${API}/admin/instrument-versions/${clone.data.id}`)).data;
  assert.equal((await admin.patch(`${API}/admin/instrument-versions/${v2.id}/questions/${v2.questions[0].id}`, { title: 'Há uma pessoa responsável pelas decisões de tecnologia?' })).status, 200);
  assert.equal((await admin.patch(`${API}/admin/instrument-versions/${v2.id}/questions/${v2.questions[0].id}`, { options: [{ score: 0, description: 'só uma' }] })).status, 400);
  assert.equal((await admin.post(`${API}/admin/instrument-versions/${v2.id}/publish`, {})).status, 200);
  const res = await gA.get(`${API}/assessments/${A.assessment}`);
  assert.equal(res.data.instrument.version, '1.0');
  const pub = (await gB.get(`${API}/instruments`)).data.published_version;
  assert.equal(pub.version, '1.1');
});

test('Inativar usuário ou empresa encerra o acesso sem apagar o histórico', async () => {
  const users = (await admin.get(`${API}/admin/users?q=ti@11222333000181`)).data.items;
  assert.equal((await admin.patch(`${API}/admin/users/${users[0].id}/status`, { status: 'INACTIVE' })).status, 200);
  assert.equal((await tiA.get(`${API}/assessments`)).status, 401);
  assert.equal((await tiA.login(A.TI.email, 'SenhaForte123')).status, 401);
  assert.equal((await admin.patch(`${API}/admin/companies/${B.id}/status`, { status: 'INACTIVE' })).status, 200);
  assert.equal((await gB.get(`${API}/assessments`)).status, 401);
  const comp = await admin.get(`${API}/admin/companies/${B.id}`);
  assert.equal(comp.data.assessments.length, 1);
});

test('Auditoria registra operações relevantes sem dados sensíveis', async () => {
  const logs = (await admin.get(`${API}/admin/audit-logs?pageSize=100`)).data;
  const actions = new Set(logs.items.map((l) => l.action));
  for (const a of ['company.created', 'invitation.sent', 'invitation.accepted', 'auth.login', 'assessment.started', 'answer.saved', 'evidence.added', 'assessment.finalized', 'report.requested', 'report.exported', 'user.inactivated']) {
    assert.ok(actions.has(a), `faltou ${a}`);
  }
  assert.ok(!JSON.stringify(logs).includes('SenhaForte123'));
});

test('Recuperação de senha com token de uso único', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const u = client(srv.base);
  assert.equal((await u.post(`${API}/auth/password/forgot`, { email: A.GESTOR.email })).status, 200);
  assert.equal((await u.post(`${API}/auth/password/forgot`, { email: 'naoexiste@x.com' })).status, 200);
  const outbox = path.join(srv.dir, 'storage', 'outbox');
  const file = fs.readdirSync(outbox).filter((f) => f.includes('redefini')).sort().pop();
  const token = fs.readFileSync(path.join(outbox, file), 'utf8').match(/#token=([\w-]+)/)[1];
  assert.equal((await u.post(`${API}/auth/password/reset`, { token, password: 'NovaSenha12345' })).status, 200);
  assert.equal((await u.post(`${API}/auth/password/reset`, { token, password: 'OutraSenha12345' })).status, 400);
  assert.equal((await gA.get(`${API}/assessments`)).status, 401); // sessões antigas invalidadas
  assert.equal((await u.login(A.GESTOR.email, 'NovaSenha12345')).status, 200);
});

test('Erros padronizados com código de rastreamento', async () => {
  const r = await admin.get(`${API}/nao-existe`);
  assert.equal(r.status, 404);
  assert.ok(r.data.error.code && r.data.error.message && r.data.error.traceId);
  assert.ok(r.headers.get('x-request-id'));
});

test('CNPJ inválido é rejeitado na criação de empresa', async () => {
  const r = await admin.post(`${API}/admin/companies`, { legal_name: 'CNPJ Ruim', cnpj: '11111111000111' });
  assert.equal(r.status, 400);
  assert.ok(r.data.error.fields.cnpj);
});

test('Gestor substituto assume avaliação em andamento após desvinculação', async () => {
  const compA = await admin.get(`${API}/admin/companies/${A.id}`);
  const inProg = compA.data.assessments.find((a) => a.status === 'IN_PROGRESS');
  assert.ok(inProg);
  const gAUsers = (await admin.get(`${API}/admin/users?q=${encodeURIComponent(A.GESTOR.email)}`)).data.items;
  assert.equal((await admin.patch(`${API}/admin/memberships`, { user_id: gAUsers[0].id, company_id: A.id, status: 'INACTIVE' })).status, 200);
  const inv2 = await admin.post(`${API}/admin/invitations`, { company_id: A.id, email: 'gestor2@11222333000181.test', name: 'Gestor 2', role: 'GESTOR' });
  assert.equal(inv2.status, 201);
  const gA2 = await activateAndLogin({ email: 'gestor2@11222333000181.test', token: tokenOf(inv2.data.activation_link) }, 'Gestor 2');
  const det = await gA2.get(`${API}/assessments/${inProg.id}`);
  assert.equal(det.data.can_edit, true);
  assert.equal((await gA2.put(`${API}/assessments/${inProg.id}/answers/${questions[0].id}`, { type: 'SCORE', score: 2 })).status, 200);
});

test('Rascunho do questionário permite criar dimensão, adicionar e excluir pergunta', async () => {
  const versions = (await admin.get(`${API}/admin/instrument-versions`)).data.items;
  const clone = await admin.post(`${API}/admin/instrument-versions/${versions[0].id}/clone`, { version: '2.0' });
  assert.equal(clone.status, 201);
  const vid = clone.data.id;
  const dim = await admin.post(`${API}/admin/instrument-versions/${vid}/dimensions`, { code: 'SEG', name: 'Segurança Extra', description: 'Teste' });
  assert.equal(dim.status, 201);
  const qAdd = await admin.post(`${API}/admin/instrument-versions/${vid}/questions`, {
    dimension_id: dim.data.id,
    code: 'P31',
    theme: 'Tema extra',
    title: 'Pergunta extra criada no rascunho?',
    references_text: 'COBIT 2019 APO01',
    options: [0, 1, 2, 3, 4].map((s) => ({ score: s, description: `Nível ${s} da pergunta` })),
  });
  assert.equal(qAdd.status, 201);
  const full = (await admin.get(`${API}/admin/instrument-versions/${vid}`)).data;
  assert.equal(full.dimensions.length, 8);
  assert.equal(full.questions.length, 31);
  assert.equal((await admin.del(`${API}/admin/instrument-versions/${vid}/questions/${qAdd.data.id}`)).status, 200);
  const afterDel = (await admin.get(`${API}/admin/instrument-versions/${vid}`)).data;
  assert.equal(afterDel.questions.length, 30);
});

test('Criação de usuários por perfil (ADMIN, GESTOR, TI) e redefinição de senha assistida', async () => {
  const created = await admin.post(`${API}/admin/admins`, { name: 'Segundo Admin', email: 'admin2@prismati.test' });
  assert.equal(created.status, 201);
  assert.ok(created.data.setup_link);
  const tok1 = tokenOf(created.data.setup_link);
  const a2 = client(srv.base);
  assert.equal((await a2.post(`${API}/auth/password/reset`, { token: tok1, password: 'Admin2Senha123' })).status, 200);
  assert.equal((await a2.login('admin2@prismati.test', 'Admin2Senha123')).status, 200);
  assert.equal((await a2.get(`${API}/admin/companies`)).status, 200);

  const reset = await admin.post(`${API}/admin/users/${created.data.id}/reset-password`, {});
  assert.equal(reset.status, 200);
  assert.ok(reset.data.reset_link);
  const tok2 = tokenOf(reset.data.reset_link);
  assert.equal((await client(srv.base).post(`${API}/auth/password/reset`, { token: tok2, password: 'Admin2Nova123' })).status, 200);

  // Novo usuário via POST /admin/users com seleção de perfil
  const noComp = await admin.post(`${API}/admin/users`, { name: 'Sem Empresa', email: 'semcomp@prismati.test', role: 'GESTOR' });
  assert.equal(noComp.status, 400);
  assert.ok(noComp.data.error.fields.company_id);

  const compC = await admin.post(`${API}/admin/companies`, { legal_name: 'Empresa C', trade_name: 'Empresa C' });
  assert.equal(compC.status, 201);

  const gCRes = await admin.post(`${API}/admin/users`, { name: 'Gestor C', email: 'gestorc@prismati.test', role: 'GESTOR', company_id: compC.data.id });
  assert.equal(gCRes.status, 201);
  assert.equal(gCRes.data.role, 'GESTOR');
  assert.equal(gCRes.data.company_id, compC.data.id);
  assert.ok(gCRes.data.setup_link);

  const gCDup = await admin.post(`${API}/admin/users`, { name: 'Outro Gestor', email: 'gestorc2@prismati.test', role: 'GESTOR', company_id: compC.data.id });
  assert.equal(gCDup.status, 400);
  assert.ok(gCDup.data.error.fields.role);

  const tiCRes = await admin.post(`${API}/admin/users`, { name: 'TI C', email: 'tic@prismati.test', role: 'TI', company_id: compC.data.id });
  assert.equal(tiCRes.status, 201);
  assert.equal(tiCRes.data.role, 'TI');

  const adm3Res = await admin.post(`${API}/admin/users`, { name: 'Admin 3', email: 'admin3@prismati.test', role: 'ADMIN' });
  assert.equal(adm3Res.status, 201);
  assert.equal(adm3Res.data.role, 'ADMIN');
  assert.equal(adm3Res.data.company_id, null);

  const gCClient = client(srv.base);
  assert.equal((await gCClient.post(`${API}/auth/password/reset`, { token: tokenOf(gCRes.data.setup_link), password: 'GestorCSenha123' })).status, 200);
  assert.equal((await gCClient.login('gestorc@prismati.test', 'GestorCSenha123')).status, 200);
  const meC = await gCClient.get(`${API}/auth/me`);
  assert.equal(meC.data.role, 'GESTOR');
  assert.equal(meC.data.company.id, compC.data.id);
});

test('RNF-005 · bloqueio após tentativas de login incorretas', async () => {
  const u = client(srv.base);
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await u.login('admin@prismati.test', 'errada')).status);
  assert.ok(statuses.includes(429));
});
