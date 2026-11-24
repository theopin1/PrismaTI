// Teste de carga (Seção 9.4 / CA-MVP-20): usuários virtuais simultâneos com 70% consultas,
// 20% salvamento de respostas e 10% relatórios. Sobe um servidor isolado com banco temporário.
// Uso: npm run loadtest -- --users 50 --minutes 15      (padrão: 50 usuários, 1 minuto)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const USERS = arg('users', 50), MINUTES = arg('minutes', 1);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismati-load-'));
Object.assign(process.env, {
  NODE_ENV: 'test', PRISMATI_SILENT: '1', PRISMATI_ENV_FILE: path.join(dir, 'none.env'), DB_FILE: path.join(dir, 'load.db'), STORAGE_DIR: path.join(dir, 'storage'),
  ADMIN_EMAIL: 'admin@load.test', ADMIN_PASSWORD: 'AdminSenha123', AI_PROVIDER: 'local', RATE_API_PER_MIN: '1000000', RATE_LOGIN_PER_15MIN: '100000', RATE_TOKEN_PER_15MIN: '100000',
  AI_MONTHLY_REPORTS_PER_COMPANY: '100000', AI_WORKER_INTERVAL_MS: '500',
});
const { bootstrap } = await import('../src/bootstrap.js');
const { createApp } = await import('../src/app.js');
const { startWorker, stopWorker } = await import('../src/services/reports.js');
const { client } = await import('../test/helpers.js');
bootstrap();
const server = await new Promise((r) => { const s = createApp().listen(0, () => r(s)); });
startWorker();
const base = `http://127.0.0.1:${server.address().port}`;
const API = '/api/v1';

// Prepara empresas (uma por usuário virtual), gestores e uma avaliação finalizada por empresa
const admin = client(base);
await admin.login('admin@load.test', 'AdminSenha123');
console.log(`Preparando ${USERS} empresas...`);
const vus = [];
for (let i = 0; i < USERS; i++) {
  const c = await admin.post(`${API}/admin/companies`, { legal_name: `Carga ${i}` });
  const inv = await admin.post(`${API}/admin/invitations`, { company_id: c.data.id, email: `g${i}@load.test`, role: 'GESTOR' });
  const u = client(base);
  await u.post(`${API}/auth/activate`, { token: inv.data.activation_link.split('#token=')[1], name: `G${i}`, password: 'SenhaForte123' });
  await u.login(`g${i}@load.test`, 'SenhaForte123');
  const a1 = (await u.post(`${API}/assessments`, {})).data.id;
  const qs = (await u.get(`${API}/instrument-versions/${(await u.get(`${API}/instruments`)).data.published_version.id}/questions`)).data.questions;
  for (const q of qs) await u.put(`${API}/assessments/${a1}/answers/${q.id}`, { type: 'SCORE', score: 2 });
  await u.post(`${API}/assessments/${a1}/finalize`, {});
  const a2 = (await u.post(`${API}/assessments`, {})).data.id;
  vus.push({ u, finalized: a1, open: a2, qs });
}

const stats = {};
const rec = (op, ms, status) => {
  const s = (stats[op] ||= { n: 0, errors5xx: 0, rejected: 0, times: [] });
  s.n++; s.times.push(ms);
  if (status >= 500) s.errors5xx++; else if (status >= 400) s.rejected++;
};
async function timed(op, fn) { const t = performance.now(); const r = await fn(); rec(op, performance.now() - t, r.status); }

const end = Date.now() + MINUTES * 60_000;
console.log(`Executando ${USERS} usuários virtuais por ${MINUTES} min...`);
await Promise.all(vus.map(async (vu) => {
  while (Date.now() < end) {
    const x = Math.random();
    if (x < 0.7) {
      const pick = Math.floor(Math.random() * 3);
      if (pick === 0) await timed('consulta_avaliacao', () => vu.u.get(`${API}/assessments/${vu.open}`));
      else if (pick === 1) await timed('consulta_resultados', () => vu.u.get(`${API}/assessments/${vu.finalized}/results`));
      else await timed('consulta_lista', () => vu.u.get(`${API}/assessments`));
    } else if (x < 0.9) {
      const q = vu.qs[Math.floor(Math.random() * vu.qs.length)];
      await timed('salvar_resposta', () => vu.u.put(`${API}/assessments/${vu.open}/answers/${q.id}`, { type: 'SCORE', score: Math.floor(Math.random() * 5) }));
    } else if (Math.random() < 0.5) {
      await timed('solicitar_relatorio', () => vu.u.post(`${API}/assessments/${vu.finalized}/reports`, {}));
    } else {
      await timed('consultar_relatorios', () => vu.u.get(`${API}/assessments/${vu.finalized}/reports`));
    }
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 800)); // tempo de "pensar"
  }
}));

const p95 = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)] ?? 0; };
const LIMITS = { consulta_avaliacao: 2000, consulta_resultados: 2000, consulta_lista: 2000, salvar_resposta: 2000, solicitar_relatorio: 2000, consultar_relatorios: 2000 };
let total = 0, total5xx = 0, ok = true;
console.log('\nOperação               Req     p95 (ms)  Meta    5xx  Rejeições esperadas');
for (const [op, s] of Object.entries(stats)) {
  total += s.n; total5xx += s.errors5xx;
  const v = p95(s.times); const pass = v <= LIMITS[op];
  ok &&= pass;
  console.log(`${op.padEnd(22)} ${String(s.n).padStart(6)}  ${v.toFixed(0).padStart(8)}  ${String(LIMITS[op]).padStart(5)}  ${String(s.errors5xx).padStart(4)}  ${s.rejected}`);
}
const errRate = (total5xx / Math.max(1, total)) * 100;
console.log(`\nTotal: ${total} requisições · erros 5xx: ${errRate.toFixed(2)}% (meta < 1%) · ${ok && errRate < 1 ? 'APROVADO' : 'REPROVADO'}`);
stopWorker();
server.close();
process.exit(ok && errRate < 1 ? 0 : 1);
