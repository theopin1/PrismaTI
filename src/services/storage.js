// Armazenamento privado de evidências (RNF-016 a RNF-018). Os arquivos ficam fora da pasta pública,
// com nomes aleatórios, e só são entregues pela API após checagem de autorização.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

const ALLOWED = {
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};

// Conteúdo ativo em PDFs é recusado (medida contra arquivos potencialmente maliciosos).
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)\b/;

export function validateUpload(file) {
  if (!file) throw badRequest('Selecione um arquivo.', { file: 'Arquivo obrigatório.' });
  const rule = ALLOWED[file.mimetype];
  if (!rule) throw badRequest('Formato não permitido. Envie PDF, PNG ou JPEG.', { file: 'Formatos aceitos: PDF, PNG, JPEG.' });
  if (file.size > config.uploads.maxBytes) throw badRequest(`Arquivo maior que ${config.uploads.maxBytes / 1024 / 1024} MB.`, { file: 'Arquivo muito grande.' });
  if (!rule.magic(file.buffer)) throw badRequest('O conteúdo do arquivo não corresponde ao formato informado.', { file: 'Arquivo inválido ou corrompido.' });
  if (file.mimetype === 'application/pdf' && PDF_ACTIVE.test(file.buffer.toString('latin1'))) {
    throw badRequest('O PDF contém conteúdo ativo (scripts ou anexos) e não pode ser aceito. Exporte-o novamente como PDF simples ou envie uma imagem.', { file: 'PDF com conteúdo ativo.' });
  }
  return rule;
}

export function saveEvidenceFile(companyId, file) {
  const rule = validateUpload(file);
  const key = path.join('evidences', companyId, `${crypto.randomUUID()}.${rule.ext}`);
  const abs = path.join(config.storageDir, key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.buffer, { mode: 0o600 });
  const safeName = path.basename(file.originalname || `evidencia.${rule.ext}`).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
  return { storage_key: key, mime_type: file.mimetype, file_size: file.size, original_filename: safeName, sha256: crypto.createHash('sha256').update(file.buffer).digest('hex') };
}

export function evidenceAbsolutePath(storageKey) {
  const abs = path.resolve(config.storageDir, storageKey);
  if (!abs.startsWith(path.resolve(config.storageDir) + path.sep)) throw badRequest('Caminho inválido.');
  return abs;
}

export function removeEvidenceFile(storageKey) {
  try { fs.unlinkSync(evidenceAbsolutePath(storageKey)); } catch { /* já removido */ }
}
