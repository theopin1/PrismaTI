// Banco de dados SQLite (node:sqlite, sem dependências nativas) e modelo lógico da Seção 8.2.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT UNIQUE,
  sector TEXT,
  company_size TEXT,
  employee_count_range TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  account_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (account_status IN ('PENDING','ACTIVE','INACTIVE')),
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  mfa_secret TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_memberships (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('GESTOR','TI')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL
);
-- MVP: um vínculo empresarial ativo por usuário
CREATE UNIQUE INDEX IF NOT EXISTS ux_membership_active_user ON company_memberships(user_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('GESTOR','TI')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS assessment_instruments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS instrument_versions (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL REFERENCES assessment_instruments(id),
  version TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (instrument_id, version)
);

CREATE TABLE IF NOT EXISTS dimensions (
  id TEXT PRIMARY KEY,
  instrument_version_id TEXT NOT NULL REFERENCES instrument_versions(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  UNIQUE (instrument_version_id, code)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  instrument_version_id TEXT NOT NULL REFERENCES instrument_versions(id),
  dimension_id TEXT NOT NULL REFERENCES dimensions(id),
  code TEXT NOT NULL,
  theme TEXT,
  title TEXT NOT NULL,
  explanation TEXT,
  evidence_guidance TEXT,
  verification_guidance TEXT,
  no_file_guidance TEXT,
  privacy_guidance TEXT,
  applicability_note TEXT,
  first_recommendation TEXT,
  primary_framework TEXT,
  display_order INTEGER NOT NULL,
  UNIQUE (instrument_version_id, code)
);

CREATE TABLE IF NOT EXISTS answer_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 4),
  description TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  UNIQUE (question_id, score)
);

CREATE TABLE IF NOT EXISTS framework_references (
  id TEXT PRIMARY KEY,
  framework_name TEXT NOT NULL,
  version TEXT,
  reference_code TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  UNIQUE (framework_name, reference_code)
);

CREATE TABLE IF NOT EXISTS question_framework_references (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  framework_reference_id TEXT NOT NULL REFERENCES framework_references(id),
  UNIQUE (question_id, framework_reference_id)
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  manager_user_id TEXT NOT NULL REFERENCES users(id),
  instrument_version_id TEXT NOT NULL REFERENCES instrument_versions(id),
  status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS','FINALIZED')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT
);
-- CA-MVP-04: no máximo uma avaliação em andamento por empresa, garantido pelo banco
CREATE UNIQUE INDEX IF NOT EXISTS ux_assessment_in_progress ON assessments(company_id) WHERE status = 'IN_PROGRESS';

CREATE TABLE IF NOT EXISTS assessment_answers (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  answer_type TEXT NOT NULL CHECK (answer_type IN ('SCORE','NA','NS')),
  answer_option_id TEXT REFERENCES answer_options(id),
  justification TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL,
  UNIQUE (assessment_id, question_id),
  CHECK ((answer_type = 'SCORE' AND answer_option_id IS NOT NULL) OR (answer_type <> 'SCORE' AND answer_option_id IS NULL))
);

CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY,
  assessment_answer_id TEXT NOT NULL REFERENCES assessment_answers(id),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('FILE','TEXT','DECLARED')),
  description TEXT,
  storage_key TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size INTEGER,
  sha256 TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessment_results (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL UNIQUE REFERENCES assessments(id),
  instrument_version_id TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  overall_maturity REAL,
  overall_classification TEXT,
  overall_coverage REAL,
  fill_percentage REAL NOT NULL,
  total_questions INTEGER NOT NULL,
  answered_count INTEGER NOT NULL,
  scored_count INTEGER NOT NULL,
  na_count INTEGER NOT NULL,
  ns_count INTEGER NOT NULL,
  result_status TEXT NOT NULL CHECK (result_status IN ('APTO_REVISAO','PRELIMINAR','SEM_DADOS')),
  calculated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_results (
  id TEXT PRIMARY KEY,
  assessment_result_id TEXT NOT NULL REFERENCES assessment_results(id),
  dimension_id TEXT NOT NULL REFERENCES dimensions(id),
  maturity_percentage REAL,
  classification TEXT,
  coverage_percentage REAL,
  fill_percentage REAL NOT NULL,
  total_questions INTEGER NOT NULL,
  applicable_questions INTEGER NOT NULL,
  scored_questions INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  result_status TEXT NOT NULL CHECK (result_status IN ('DISPONIVEL','INDISPONIVEL')),
  UNIQUE (assessment_result_id, dimension_id)
);

CREATE TABLE IF NOT EXISTS ai_report_jobs (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error_code TEXT,
  error_message TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_report_job_active ON ai_report_jobs(assessment_id) WHERE status IN ('QUEUED','PROCESSING');

CREATE TABLE IF NOT EXISTS ai_reports (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  report_job_id TEXT NOT NULL REFERENCES ai_report_jobs(id),
  report_version INTEGER NOT NULL,
  content TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  output_schema_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  UNIQUE (assessment_id, report_version)
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  user_id TEXT REFERENCES users(id),
  report_job_id TEXT REFERENCES ai_report_jobs(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  company_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata TEXT,
  ip TEXT,
  trace_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS ix_audit_company ON audit_logs(company_id);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

let db;

export function openDb(file = config.dbFile) {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = undefined; }
}

// Transação simples (node:sqlite é síncrono, então BEGIN IMMEDIATE serializa escritas concorrentes).
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const r = fn(d);
    d.exec('COMMIT');
    return r;
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch { /* já revertida */ }
    throw e;
  }
}

export const one = (sql, ...p) => getDb().prepare(sql).get(...p);
export const all = (sql, ...p) => getDb().prepare(sql).all(...p);
export const run = (sql, ...p) => getDb().prepare(sql).run(...p);
