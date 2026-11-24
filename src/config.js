// Configuração lida do ambiente (RNF-042: credenciais fora do código-fonte).
// Um arquivo .env opcional na raiz é carregado sem dependências externas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const file = process.env.PRISMATI_ENV_FILE || path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'sim'].includes(String(v).toLowerCase()));

export const config = {
  env: env.NODE_ENV || 'development', // development | homologacao | production
  port: int(env.PORT, 3000),
  baseUrl: env.BASE_URL || `http://localhost:${int(env.PORT, 3000)}`,
  dbFile: path.resolve(ROOT, env.DB_FILE || 'storage/prismati.db'),
  storageDir: path.resolve(ROOT, env.STORAGE_DIR || 'storage'),
  backupDir: path.resolve(ROOT, env.BACKUP_DIR || 'backups'),
  trustProxy: bool(env.TRUST_PROXY, false),

  session: {
    idleMinutes: int(env.SESSION_IDLE_MINUTES, 120),
    absoluteHours: int(env.SESSION_ABSOLUTE_HOURS, 12),
  },
  inviteHours: int(env.INVITE_EXPIRES_HOURS, 72),
  resetMinutes: int(env.RESET_EXPIRES_MINUTES, 30),
  adminMfaRequired: bool(env.ADMIN_MFA_REQUIRED, env.NODE_ENV === 'production'),
  adminCanViewAnswers: bool(env.ADMIN_CAN_VIEW_ANSWERS, false),

  rateLimit: {
    loginPer15Min: int(env.RATE_LOGIN_PER_15MIN, 10),
    tokenPer15Min: int(env.RATE_TOKEN_PER_15MIN, 20),
    apiPerMinute: int(env.RATE_API_PER_MIN, 600),
  },

  uploads: {
    maxBytes: int(env.UPLOAD_MAX_MB, 5) * 1024 * 1024,
    maxPerAnswer: int(env.UPLOAD_MAX_PER_ANSWER, 5),
  },

  mail: {
    smtpUrl: env.SMTP_URL || '',
    from: env.MAIL_FROM || 'PrismaTI <nao-responda@prismati.com.br>',
  },

  ai: {
    provider: env.AI_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'local'),
    model: env.AI_MODEL || 'claude-opus-5-5',
    effort: env.AI_EFFORT || 'high',
    maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 32000),
    maxAttempts: int(env.AI_MAX_ATTEMPTS, 3),
    monthlyReportsPerCompany: int(env.AI_MONTHLY_REPORTS_PER_COMPANY, 10),
    monthlyTokensPerCompany: int(env.AI_MONTHLY_TOKENS_PER_COMPANY, 2_000_000),
    monthlyTokensGlobal: int(env.AI_MONTHLY_TOKENS_GLOBAL, 20_000_000),
    priceInputPerMTok: Number(env.AI_PRICE_INPUT_PER_MTOK || 4),
    priceOutputPerMTok: Number(env.AI_PRICE_OUTPUT_PER_MTOK || 20),
    workerIntervalMs: int(env.AI_WORKER_INTERVAL_MS, 2000),
  },

  bootstrapAdmin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
    name: env.ADMIN_NAME || 'Administrador PrismaTI',
  },
};

export const isProd = config.env === 'production';
