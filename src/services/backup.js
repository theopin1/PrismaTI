// Backup e restauração (RNF-026 a RNF-028): banco (snapshot consistente via VACUUM INTO) + evidências.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p, base) : [path.relative(base, p)];
  });
}

export function createBackup({ dbFile = config.dbFile, storageDir = config.storageDir, backupDir = config.backupDir } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `prismati-${stamp}`);
  fs.mkdirSync(path.join(target, 'evidences'), { recursive: true });
  const src = new DatabaseSync(dbFile);
  src.exec(`VACUUM INTO '${path.join(target, 'prismati.db').replace(/'/g, "''")}'`);
  src.close();
  const evDir = path.join(storageDir, 'evidences');
  const files = listFiles(evDir);
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(target, 'evidences', f)), { recursive: true });
    fs.copyFileSync(path.join(evDir, f), path.join(target, 'evidences', f));
  }
  const manifest = {
    created_at: new Date().toISOString(),
    database: { file: 'prismati.db', sha256: sha(path.join(target, 'prismati.db')) },
    evidences: files.map((f) => ({ file: f, sha256: sha(path.join(target, 'evidences', f)) })),
  };
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir: target, manifest };
}

export function verifyBackup(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (sha(path.join(dir, manifest.database.file)) !== manifest.database.sha256) throw new Error('Banco do backup corrompido.');
  for (const e of manifest.evidences) if (sha(path.join(dir, 'evidences', e.file)) !== e.sha256) throw new Error(`Evidência corrompida: ${e.file}`);
  const db = new DatabaseSync(path.join(dir, manifest.database.file), { readOnly: true });
  const check = db.prepare('PRAGMA integrity_check').get();
  db.close();
  if (Object.values(check)[0] !== 'ok') throw new Error('Falha na verificação de integridade do banco.');
  return manifest;
}

// A restauração deve ser feita com o servidor parado.
export function restoreBackup(dir, { dbFile = config.dbFile, storageDir = config.storageDir } = {}) {
  const manifest = verifyBackup(dir);
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const suffix of ['-wal', '-shm']) if (fs.existsSync(dbFile + suffix)) fs.renameSync(dbFile + suffix, `${dbFile}${suffix}.pre-restore`);
  if (fs.existsSync(dbFile)) fs.renameSync(dbFile, `${dbFile}.pre-restore`);
  fs.copyFileSync(path.join(dir, manifest.database.file), dbFile);
  for (const e of manifest.evidences) {
    const to = path.join(storageDir, 'evidences', e.file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(dir, 'evidences', e.file), to);
  }
  return manifest;
}
