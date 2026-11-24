// Inicialização: banco, instrumento oficial e administrador inicial.
import { config } from './config.js';
import { openDb, one, run } from './db.js';
import { seedInstrument } from './services/instrument.js';
import { hashPassword, strongPassword, PASSWORD_RULE } from './lib/security.js';
import { uuid, nowIso } from './lib/util.js';
import { log } from './lib/logger.js';

export function bootstrap({ dbFile } = {}) {
  openDb(dbFile);
  if (seedInstrument()) log.info('instrument.seeded', { version: '1.0', questions: 30 });
  const { email, password, name } = config.bootstrapAdmin;
  if (email && !one('SELECT 1 FROM users WHERE is_platform_admin = 1')) {
    if (!strongPassword(password)) throw new Error(`ADMIN_PASSWORD inválida. ${PASSWORD_RULE}`);
    const now = nowIso();
    run('INSERT INTO users (id, name, email, password_hash, account_status, is_platform_admin, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      uuid(), name, email.toLowerCase(), hashPassword(password), 'ACTIVE', 1, now, now);
    log.info('admin.created', { email });
  }
}
