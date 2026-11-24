// Registro de auditoria (RF-058, RF-059, RNF-038). Nunca grava senhas/tokens (RNF-040).
import { run } from '../db.js';
import { uuid, nowIso } from './util.js';
import { redact } from './logger.js';

export function audit(req, action, { companyId = null, entityType = null, entityId = null, metadata = null, actorId } = {}) {
  run(
    `INSERT INTO audit_logs (id, actor_user_id, company_id, action, entity_type, entity_id, metadata, ip, trace_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    uuid(), actorId ?? req?.user?.id ?? null, companyId, action, entityType, entityId,
    metadata ? JSON.stringify(redact(metadata)) : null, req?.ip ?? null, req?.traceId ?? null, nowIso(),
  );
}
