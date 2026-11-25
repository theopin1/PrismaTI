// Backup/restauração (RNF-026/027) e MFA de administradores (RNF-007).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, client } from './helpers.js';

let srv, admin;
before(async () => { srv = await startTestServer(); admin = client(srv.base); await admin.login('admin@prismati.test', 'AdminSenha123'); });
after(async () => { await srv.close(); });

test('Backup gera cópia verificável e a restauração recupera os dados', async () => {
  await admin.post('/api/v1/admin/companies', { legal_name: 'Empresa Backup' });
  const evDir = path.join(srv.dir, 'storage', 'evidences', 'x');
  fs.mkdirSync(evDir, { recursive: true });
  fs.writeFileSync(path.join(evDir, 'a.png'), 'conteudo');
  const { createBackup, verifyBackup, restoreBackup } = await import('../src/services/backup.js');
  const { dir, manifest } = createBackup();
  assert.equal(manifest.evidences.length, 1);
  verifyBackup(dir);
  // restaura em outro local e confere o conteúdo
  const target = path.join(srv.dir, 'restored');
  restoreBackup(dir, { dbFile: path.join(target, 'r.db'), storageDir: target });
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(target, 'r.db'));
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM companies WHERE legal_name = 'Empresa Backup'`).get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM questions').get().n, 30);
  db.close();
  assert.equal(fs.readFileSync(path.join(target, 'evidences', 'x', 'a.png'), 'utf8'), 'conteudo');
  // backup adulterado é detectado
  fs.appendFileSync(path.join(dir, 'evidences', 'x', 'a.png'), '!');
  assert.throws(() => verifyBackup(dir), /corrompida/);
});

test('Administrador ativa verificação em duas etapas e passa a precisar do código', async () => {
  const { totp } = await import('../src/lib/security.js');
  const setup = await admin.post('/api/v1/auth/mfa/setup', {});
  assert.ok(setup.data.secret);
  assert.ok(typeof setup.data.qr_svg === 'string' && setup.data.qr_svg.startsWith('<svg'));
  assert.equal((await admin.post('/api/v1/auth/mfa/enable', { code: '000000' })).status, 400);
  assert.equal((await admin.post('/api/v1/auth/mfa/enable', { code: totp(setup.data.secret) })).status, 200);
  const u = client(srv.base);
  const step1 = await u.login('admin@prismati.test', 'AdminSenha123');
  assert.equal(step1.data.mfa_required, true);
  assert.equal((await u.get('/api/v1/auth/me')).status, 401);
  const bad = await u.post('/api/v1/auth/login', { email: 'admin@prismati.test', password: 'AdminSenha123', mfa_code: '123456' });
  assert.equal(bad.status, 401);
  const ok = await u.post('/api/v1/auth/login', { email: 'admin@prismati.test', password: 'AdminSenha123', mfa_code: totp(setup.data.secret) });
  assert.equal(ok.status, 200);
  assert.equal((await u.get('/api/v1/auth/me')).data.mfa_enabled, true);
  assert.equal((await u.post('/api/v1/auth/mfa/disable', { code: totp(setup.data.secret) })).status, 200);
  assert.equal((await u.get('/api/v1/auth/me')).data.mfa_enabled, false);
});

test('Senhas são armazenadas apenas como hash', async () => {
  const { getDb } = await import('../src/db.js');
  const row = getDb().prepare(`SELECT password_hash FROM users WHERE email = 'admin@prismati.test'`).get();
  assert.ok(row.password_hash.startsWith('scrypt$'));
  assert.ok(!row.password_hash.includes('AdminSenha123'));
});
