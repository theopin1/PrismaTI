// Autenticação, convites, recuperação de senha e MFA (RF-001 a RF-007, RNF-002/003/005/006/007).
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, run, tx } from '../db.js';
import { uuid, nowIso, addMinutes, randomToken, sha256 } from '../lib/util.js';
import { parse, badRequest, unauthorized, AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword, strongPassword, PASSWORD_RULE, newTotpSecret, verifyTotp } from '../lib/security.js';
import { qrSvg } from '../lib/qr.js';
import { createSession, destroySession, revokeUserSessions, requireAuth } from '../lib/auth.js';
import { rateLimit } from '../lib/ratelimit.js';
import { audit } from '../lib/audit.js';
import { sendMail, resetMail } from '../services/mailer.js';

const r = Router();
const loginLimiter = rateLimit({ name: 'login', limit: config.rateLimit.loginPer15Min, windowMs: 15 * 60_000 });
const tokenLimiter = rateLimit({ name: 'token', limit: config.rateLimit.tokenPer15Min, windowMs: 15 * 60_000 });

const email = z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(200);
const password = z.string().refine(strongPassword, PASSWORD_RULE);

r.post('/login', loginLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1, 'Informe a senha.').max(200), mfa_code: z.string().optional() }), req.body);
  const user = one('SELECT * FROM users WHERE email = ?', body.email);
  const generic = () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
  if (!user || user.account_status !== 'ACTIVE') {
    audit(req, 'auth.login_failed', { metadata: { reason: 'unknown_or_inactive' } });
    throw generic();
  }
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Muitas tentativas incorretas. Tente novamente em alguns minutos ou redefina sua senha.');
  }
  if (!verifyPassword(body.password, user.password_hash)) {
    const fails = user.failed_logins + 1;
    run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', fails >= 5 ? 0 : fails, fails >= 5 ? addMinutes(15) : null, user.id);
    audit(req, 'auth.login_failed', { actorId: user.id, metadata: { reason: 'bad_password' } });
    throw generic();
  }
  if (!user.is_platform_admin) {
    const m = one(`SELECT c.status FROM company_memberships m JOIN companies c ON c.id = m.company_id WHERE m.user_id = ? AND m.status = 'ACTIVE'`, user.id);
    if (!m || m.status !== 'ACTIVE') { audit(req, 'auth.login_failed', { actorId: user.id, metadata: { reason: 'company_inactive' } }); throw generic(); }
  }
  if (user.mfa_enabled) {
    if (!body.mfa_code) return res.status(200).json({ mfa_required: true });
    if (!verifyTotp(user.mfa_secret, body.mfa_code)) {
      audit(req, 'auth.mfa_failed', { actorId: user.id });
      throw new AppError(401, 'INVALID_MFA', 'Código de verificação inválido.');
    }
  }
  run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id);
  createSession(res, user, req);
  audit(req, 'auth.login', { actorId: user.id });
  res.json({ ok: true, redirect: user.is_platform_admin ? '/admin.html' : '/painel.html' });
});

r.post('/logout', (req, res) => {
  if (req.user) audit(req, 'auth.logout');
  destroySession(req, res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, name: u.name, email: u.email, role: u.role, is_platform_admin: u.is_platform_admin,
    mfa_enabled: !!u.mfa_enabled, mfa_setup_required: u.is_platform_admin && config.adminMfaRequired && !u.mfa_enabled,
    company: u.company ? { id: u.company.company_id, name: u.company.trade_name || u.company.legal_name } : null,
  });
});

// Pré-visualização do convite (sem revelar dados além do necessário)
r.get('/invitation', tokenLimiter, (req, res) => {
  const inv = one(`SELECT i.email, i.name, i.role, i.expires_at, i.status, c.trade_name, c.legal_name FROM invitations i JOIN companies c ON c.id = i.company_id WHERE i.token_hash = ?`, sha256(String(req.query.token || '')));
  if (!inv || inv.status !== 'PENDING' || Date.parse(inv.expires_at) < Date.now()) throw badRequest('Convite inválido, expirado ou já utilizado. Peça um novo convite ao administrador.');
  res.json({ email: inv.email, name: inv.name, role: inv.role, company: inv.trade_name || inv.legal_name });
});

r.post('/activate', tokenLimiter, (req, res) => {
  const body = parse(z.object({ token: z.string().min(10), name: z.string().trim().min(2, 'Informe seu nome.').max(120), password }), req.body);
  const result = tx(() => {
    const inv = one('SELECT * FROM invitations WHERE token_hash = ?', sha256(body.token));
    if (!inv || inv.status !== 'PENDING' || Date.parse(inv.expires_at) < Date.now()) throw badRequest('Convite inválido, expirado ou já utilizado. Peça um novo convite ao administrador.');
    const company = one('SELECT status FROM companies WHERE id = ?', inv.company_id);
    if (company.status !== 'ACTIVE') throw badRequest('A empresa deste convite está inativa.');
    let user = one('SELECT * FROM users WHERE email = ?', inv.email);
    const now = nowIso();
    if (user && user.account_status === 'ACTIVE' && user.password_hash) throw badRequest('Este e-mail já possui uma conta ativa. Entre com sua senha.');
    if (user?.is_platform_admin) throw badRequest('Convite inválido para este e-mail.');
    if (!user) {
      user = { id: uuid() };
      run('INSERT INTO users (id, name, email, password_hash, account_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', user.id, body.name, inv.email, hashPassword(body.password), 'ACTIVE', now, now);
    } else {
      run(`UPDATE users SET name = ?, password_hash = ?, account_status = 'ACTIVE', updated_at = ? WHERE id = ?`, body.name, hashPassword(body.password), now, user.id);
    }
    run(`UPDATE company_memberships SET status = 'INACTIVE' WHERE user_id = ? AND status = 'ACTIVE'`, user.id);
    run('INSERT INTO company_memberships (id, company_id, user_id, role, status, created_at) VALUES (?,?,?,?,?,?)', uuid(), inv.company_id, user.id, inv.role, 'ACTIVE', now);
    run(`UPDATE invitations SET status = 'ACCEPTED', accepted_at = ? WHERE id = ?`, now, inv.id);
    return { userId: user.id, companyId: inv.company_id, role: inv.role };
  });
  audit(req, 'invitation.accepted', { actorId: result.userId, companyId: result.companyId, entityType: 'user', entityId: result.userId, metadata: { role: result.role } });
  res.json({ ok: true });
});

r.post('/password/forgot', tokenLimiter, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const user = one(`SELECT * FROM users WHERE email = ? AND account_status = 'ACTIVE'`, body.email);
  if (user) {
    const token = randomToken();
    run(`UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL`, nowIso(), user.id);
    run('INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)', uuid(), user.id, sha256(token), addMinutes(config.resetMinutes), nowIso());
    const mail = resetMail({ name: user.name, link: `${config.baseUrl}/redefinir.html#token=${token}`, minutes: config.resetMinutes });
    await sendMail({ to: user.email, ...mail });
    audit(req, 'auth.password_reset_requested', { actorId: user.id });
  }
  // Mesma resposta sempre, para não revelar se o e-mail existe
  res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.' });
});

r.post('/password/reset', tokenLimiter, (req, res) => {
  const body = parse(z.object({ token: z.string().min(10), password }), req.body);
  const pr = one('SELECT * FROM password_resets WHERE token_hash = ?', sha256(body.token));
  if (!pr || pr.used_at || Date.parse(pr.expires_at) < Date.now()) throw badRequest('Link inválido, expirado ou já utilizado. Solicite um novo.');
  tx(() => {
    run('UPDATE password_resets SET used_at = ? WHERE id = ?', nowIso(), pr.id);
    run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', hashPassword(body.password), nowIso(), pr.user_id);
  });
  revokeUserSessions(pr.user_id);
  audit(req, 'auth.password_reset', { actorId: pr.user_id });
  res.json({ ok: true });
});

// ---- MFA (TOTP) — disponível para todos, recomendado/obrigatório para administradores ----
r.post('/mfa/setup', requireAuth, (req, res) => {
  const secret = newTotpSecret();
  run('UPDATE users SET mfa_secret = ?, mfa_enabled = 0 WHERE id = ?', secret, req.user.id);
  const label = encodeURIComponent(`PrismaTI:${req.user.email}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=PrismaTI`;
  res.json({ secret, otpauth_url: otpauthUrl, qr_svg: qrSvg(otpauthUrl) });
});

r.post('/mfa/enable', requireAuth, (req, res) => {
  const { code } = parse(z.object({ code: z.string() }), req.body);
  const u = one('SELECT mfa_secret FROM users WHERE id = ?', req.user.id);
  if (!u.mfa_secret || !verifyTotp(u.mfa_secret, code)) throw badRequest('Código inválido.', { code: 'Confira o código no aplicativo autenticador.' });
  run('UPDATE users SET mfa_enabled = 1 WHERE id = ?', req.user.id);
  audit(req, 'auth.mfa_enabled');
  res.json({ ok: true });
});

r.post('/mfa/disable', requireAuth, (req, res) => {
  const { code } = parse(z.object({ code: z.string() }), req.body);
  const u = one('SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?', req.user.id);
  if (!u.mfa_enabled || !verifyTotp(u.mfa_secret, code)) throw unauthorized('Código inválido.');
  if (req.user.is_platform_admin && config.adminMfaRequired) throw badRequest('A verificação em duas etapas é obrigatória para administradores.');
  run('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?', req.user.id);
  audit(req, 'auth.mfa_disabled');
  res.json({ ok: true });
});

export default r;
