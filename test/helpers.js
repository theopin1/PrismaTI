// Sobe a aplicação com banco e armazenamento temporários para os testes de integração.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function startTestServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismati-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', PRISMATI_SILENT: '1', PRISMATI_ENV_FILE: path.join(dir, 'none.env'),
    DB_FILE: path.join(dir, 'test.db'), STORAGE_DIR: path.join(dir, 'storage'), BACKUP_DIR: path.join(dir, 'backups'),
    ADMIN_EMAIL: 'admin@prismati.test', ADMIN_PASSWORD: 'AdminSenha123', AI_PROVIDER: 'local', AI_WORKER_INTERVAL_MS: '100000',
    RATE_API_PER_MIN: '100000', ...extraEnv,
  });
  const { bootstrap } = await import('../src/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  bootstrap();
  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, dir, close: () => new Promise((r) => server.close(r)) };
}

// Cliente HTTP com cookie (um por usuário)
export function client(base) {
  let cookie = '';
  async function req(method, url, body, { raw = false, headers = {}, csrf = true } = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(base + url, {
      method,
      headers: { ...(csrf ? { 'X-PrismaTI': '1' } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    if (raw) return res;
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (u, o) => req('GET', u, undefined, o), post: (u, b, o) => req('POST', u, b, o), put: (u, b, o) => req('PUT', u, b, o),
    patch: (u, b, o) => req('PATCH', u, b, o), del: (u, o) => req('DELETE', u, undefined, o),
    login: (email, password) => req('POST', '/api/v1/auth/login', { email, password }),
    get cookie() { return cookie; },
  };
}

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
export const PDF_OK = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
export const PDF_JS = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF');
