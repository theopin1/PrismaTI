// Sessões e autorização (RNF-003, RNF-004, RNF-008 a RNF-010).
import { config, isProd } from '../config.js';
import { one, run } from '../db.js';
import { uuid, nowIso, addMinutes, randomToken, sha256 } from './util.js';
import { unauthorized, forbidden, notFound } from './errors.js';

export const COOKIE = 'prismati_session';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createSession(res, user, req) {
  const token = randomToken(32);
  const now = new Date();
  run(`INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)`,
    uuid(), user.id, sha256(token), now.toISOString(), now.toISOString(), addMinutes(config.session.absoluteHours * 60, now),
    req.ip, String(req.headers['user-agent'] || '').slice(0, 200));
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: config.session.absoluteHours * 3600_000,
  });
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', nowIso(), sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export const revokeUserSessions = (userId) => run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', nowIso(), userId);

// Carrega o usuário da sessão; aplica expiração por inatividade e absoluta, e invalida
// automaticamente se o usuário, o vínculo ou a empresa estiverem inativos.
export function loadSession(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return next();
  const s = one('SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL', sha256(token));
  if (!s) return next();
  const now = Date.now();
  if (Date.parse(s.expires_at) < now || Date.parse(s.last_seen_at) + config.session.idleMinutes * 60_000 < now) {
    run('UPDATE sessions SET revoked_at = ? WHERE id = ?', nowIso(), s.id);
    return next();
  }
  const user = one('SELECT id, name, email, account_status, is_platform_admin, mfa_enabled FROM users WHERE id = ?', s.user_id);
  if (!user || user.account_status !== 'ACTIVE') return next();
  let membership = null;
  if (!user.is_platform_admin) {
    membership = one(`SELECT m.id, m.company_id, m.role, c.status AS company_status, c.trade_name, c.legal_name
                      FROM company_memberships m JOIN companies c ON c.id = m.company_id
                      WHERE m.user_id = ? AND m.status = 'ACTIVE'`, user.id);
    if (!membership || membership.company_status !== 'ACTIVE') return next();
  }
  run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', nowIso(), s.id);
  req.user = { ...user, is_platform_admin: !!user.is_platform_admin, role: user.is_platform_admin ? 'ADMIN' : membership.role, companyId: membership?.company_id ?? null, company: membership };
  req.sessionId = s.id;
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.user.is_platform_admin) return next(forbidden());
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

// Autorização por recurso: a empresa do recurso precisa ser a do usuário (ou admin quando permitido).
export function assertCompanyAccess(req, companyId, { allowAdmin = true } = {}) {
  if (req.user.is_platform_admin && allowAdmin) return;
  if (!companyId || req.user.companyId !== companyId) throw notFound();
}

export function loadAssessmentOr404(req, assessmentId, { allowAdmin = true } = {}) {
  const a = one('SELECT * FROM assessments WHERE id = ?', assessmentId);
  if (!a) throw notFound('Avaliação não encontrada.');
  assertCompanyAccess(req, a.company_id, { allowAdmin });
  return a;
}
