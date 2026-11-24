// Instrumento de avaliação versionado (Seção 5, RF-013 a RF-019).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { one, all, run, tx } from '../db.js';
import { uuid, nowIso } from '../lib/util.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

export const DIMENSIONS = [
  { code: 'GOV', name: 'Governança e riscos', description: 'Responsabilidades, planejamento, riscos e rotinas de decisão sobre tecnologia.' },
  { code: 'DAD', name: 'Dados e pessoas', description: 'Regras de proteção da informação, dados importantes, orientação da equipe e dados pessoais.' },
  { code: 'ACE', name: 'Acessos e proteção', description: 'Controle de acessos, verificação extra de login, permissões, atualizações e inventário.' },
  { code: 'BAC', name: 'Backup e continuidade', description: 'Cópias de segurança, restauração, paralisações e descarte seguro.' },
  { code: 'SER', name: 'Serviços e fornecedores', description: 'Suporte, incidentes, problemas recorrentes, monitoramento e fornecedores.' },
  { code: 'PRO', name: 'Projetos, mudanças e qualidade', description: 'Mudanças, planejamento de entregas, acompanhamento, verificação e comunicação.' },
  { code: 'MED', name: 'Medição e melhoria', description: 'Melhoria de processos, indicadores e capacitação.' },
];

const FRAMEWORK_PATTERNS = [
  [/^COBIT/i, 'COBIT', '2019'],
  [/^ISO(\/IEC)?\s*27001/i, 'ISO/IEC 27001', '2022'],
  [/^ISO(\/IEC)?\s*27002/i, 'ISO/IEC 27002', '2022'],
  [/^ITIL/i, 'ITIL', '4'],
  [/^CMMI/i, 'CMMI', 'DEV v1.3'],
  [/LGPD|legisla/i, 'LGPD', '13.709/2018'],
];

export function parseReferences(refs, link) {
  return String(refs || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const hit = FRAMEWORK_PATTERNS.find(([re]) => re.test(part));
      return { framework_name: hit ? hit[1] : 'Outro', version: hit ? hit[2] : null, reference_code: part, source_url: link || null };
    });
}

function upsertReference(ref) {
  const found = one('SELECT id FROM framework_references WHERE framework_name = ? AND reference_code = ?', ref.framework_name, ref.reference_code);
  if (found) return found.id;
  const id = uuid();
  run('INSERT INTO framework_references (id, framework_name, version, reference_code, description, source_url) VALUES (?,?,?,?,?,?)',
    id, ref.framework_name, ref.version, ref.reference_code, ref.description || null, ref.source_url);
  return id;
}

// Carrega a matriz oficial (planilha "Instrumento 30") como versão 1.0 publicada.
export function seedInstrument() {
  if (one('SELECT id FROM assessment_instruments LIMIT 1')) return false;
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/instrument-v1.questions.json'), 'utf8'));
  tx(() => {
    const instrumentId = uuid();
    run('INSERT INTO assessment_instruments (id, name, description, status) VALUES (?,?,?,?)',
      instrumentId, 'Instrumento PrismaTI', 'Diagnóstico inicial de maturidade em TI para PMEs (COBIT, ISO/IEC 27001/27002, ITIL e CMMI).', 'ACTIVE');
    const versionId = uuid();
    run('INSERT INTO instrument_versions (id, instrument_id, version, methodology_version, status, published_at, created_at) VALUES (?,?,?,?,?,?,?)',
      versionId, instrumentId, '1.0', 'calc-1.0.0', 'PUBLISHED', nowIso(), nowIso());
    const dimIds = {};
    DIMENSIONS.forEach((d, i) => {
      dimIds[d.name] = uuid();
      run('INSERT INTO dimensions (id, instrument_version_id, code, name, description, display_order) VALUES (?,?,?,?,?,?)',
        dimIds[d.name], versionId, d.code, d.name, d.description, i + 1);
    });
    rows.forEach((r, i) => {
      const qid = uuid();
      if (!dimIds[r.dim]) throw new Error(`Dimensão desconhecida na matriz: ${r.dim}`);
      run(`INSERT INTO questions (id, instrument_version_id, dimension_id, code, theme, title, explanation, evidence_guidance,
            verification_guidance, no_file_guidance, privacy_guidance, applicability_note, first_recommendation, primary_framework, display_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        qid, versionId, dimIds[r.dim], r.id, r.theme, r.q, r.what, r.evidence, r.confirm, r.noFile, r.privacy, r.note, r.rec, r.origin, i + 1);
      [r.o0, r.o1, r.o2, r.o3, r.o4].forEach((desc, score) => {
        run('INSERT INTO answer_options (id, question_id, score, description, display_order) VALUES (?,?,?,?,?)', uuid(), qid, score, desc, score + 1);
      });
      for (const ref of parseReferences(r.refs, r.link)) {
        run('INSERT OR IGNORE INTO question_framework_references (id, question_id, framework_reference_id) VALUES (?,?,?)', uuid(), qid, upsertReference(ref));
      }
    });
  });
  return true;
}

export function getPublishedVersion() {
  return one(`SELECT * FROM instrument_versions WHERE status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 1`);
}

// Versão completa com dimensões, perguntas, alternativas, orientações e referências (RNF-054).
export function getVersionFull(versionId) {
  const version = one('SELECT * FROM instrument_versions WHERE id = ?', versionId);
  if (!version) throw notFound('Versão do questionário não encontrada.');
  const dimensions = all('SELECT id, code, name, description, display_order FROM dimensions WHERE instrument_version_id = ? ORDER BY display_order', versionId);
  const questions = all('SELECT * FROM questions WHERE instrument_version_id = ? ORDER BY display_order', versionId);
  const options = all(`SELECT o.* FROM answer_options o JOIN questions q ON q.id = o.question_id WHERE q.instrument_version_id = ? ORDER BY o.display_order`, versionId);
  const refs = all(`SELECT qfr.question_id, fr.framework_name, fr.version, fr.reference_code, fr.source_url
                    FROM question_framework_references qfr JOIN framework_references fr ON fr.id = qfr.framework_reference_id
                    JOIN questions q ON q.id = qfr.question_id WHERE q.instrument_version_id = ?`, versionId);
  const byQ = (list) => list.reduce((m, x) => ((m[x.question_id] ||= []).push(x), m), {});
  const optsBy = byQ(options), refsBy = byQ(refs);
  return {
    ...version,
    dimensions,
    questions: questions.map((q) => ({
      ...q,
      options: (optsBy[q.id] || []).map(({ id, score, description }) => ({ id, score, description })),
      references: (refsBy[q.id] || []).map(({ question_id, ...r }) => r),
    })),
  };
}

export function listVersions() {
  return all(`SELECT v.*, (SELECT COUNT(*) FROM assessments a WHERE a.instrument_version_id = v.id) AS assessments_count
              FROM instrument_versions v ORDER BY v.created_at DESC`);
}

const isUsed = (versionId) => !!one('SELECT 1 FROM assessments WHERE instrument_version_id = ? LIMIT 1', versionId);

function assertDraft(versionId) {
  const v = one('SELECT * FROM instrument_versions WHERE id = ?', versionId);
  if (!v) throw notFound('Versão não encontrada.');
  // RF-019 / 4.4: versões publicadas ou utilizadas não podem ser alteradas retroativamente.
  if (v.status !== 'DRAFT' || isUsed(versionId)) throw conflict('Somente versões em rascunho podem ser editadas. Crie uma nova versão.', 'VERSION_LOCKED');
  return v;
}

// RF-018: cria nova versão (rascunho) copiando a versão de origem.
export function cloneVersion(sourceId, newVersion) {
  const src = getVersionFull(sourceId);
  if (one('SELECT 1 FROM instrument_versions WHERE instrument_id = ? AND version = ?', src.instrument_id, newVersion)) {
    throw badRequest('Já existe uma versão com esse número.', { version: 'Número de versão já utilizado.' });
  }
  return tx(() => {
    const vid = uuid();
    run('INSERT INTO instrument_versions (id, instrument_id, version, methodology_version, status, created_at) VALUES (?,?,?,?,?,?)',
      vid, src.instrument_id, newVersion, src.methodology_version, 'DRAFT', nowIso());
    const dimMap = {};
    for (const d of src.dimensions) {
      dimMap[d.id] = uuid();
      run('INSERT INTO dimensions (id, instrument_version_id, code, name, description, display_order) VALUES (?,?,?,?,?,?)', dimMap[d.id], vid, d.code, d.name, d.description, d.display_order);
    }
    for (const q of src.questions) {
      const qid = uuid();
      run(`INSERT INTO questions (id, instrument_version_id, dimension_id, code, theme, title, explanation, evidence_guidance,
            verification_guidance, no_file_guidance, privacy_guidance, applicability_note, first_recommendation, primary_framework, display_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        qid, vid, dimMap[q.dimension_id], q.code, q.theme, q.title, q.explanation, q.evidence_guidance, q.verification_guidance,
        q.no_file_guidance, q.privacy_guidance, q.applicability_note, q.first_recommendation, q.primary_framework, q.display_order);
      for (const o of q.options) run('INSERT INTO answer_options (id, question_id, score, description, display_order) VALUES (?,?,?,?,?)', uuid(), qid, o.score, o.description, o.score + 1);
      for (const r of q.references) run('INSERT OR IGNORE INTO question_framework_references (id, question_id, framework_reference_id) VALUES (?,?,?)', uuid(), qid, upsertReference(r));
    }
    return vid;
  });
}

export function updateDimension(versionId, dimensionId, data) {
  assertDraft(versionId);
  const d = one('SELECT * FROM dimensions WHERE id = ? AND instrument_version_id = ?', dimensionId, versionId);
  if (!d) throw notFound('Dimensão não encontrada.');
  run('UPDATE dimensions SET name = ?, description = ? WHERE id = ?', data.name ?? d.name, data.description ?? d.description, dimensionId);
}

const Q_FIELDS = ['theme', 'title', 'explanation', 'evidence_guidance', 'verification_guidance', 'no_file_guidance', 'privacy_guidance', 'applicability_note', 'first_recommendation', 'primary_framework'];

export function updateQuestion(versionId, questionId, data) {
  assertDraft(versionId);
  const q = one('SELECT * FROM questions WHERE id = ? AND instrument_version_id = ?', questionId, versionId);
  if (!q) throw notFound('Pergunta não encontrada.');
  tx(() => {
    for (const f of Q_FIELDS) if (data[f] !== undefined) run(`UPDATE questions SET ${f} = ? WHERE id = ?`, data[f], questionId);
    if (data.dimension_id) {
      if (!one('SELECT 1 FROM dimensions WHERE id = ? AND instrument_version_id = ?', data.dimension_id, versionId)) throw badRequest('Dimensão inválida.', { dimension_id: 'Dimensão não pertence a esta versão.' });
      run('UPDATE questions SET dimension_id = ? WHERE id = ?', data.dimension_id, questionId);
    }
    if (data.options) {
      // Exatamente cinco alternativas, notas 0..4 (8.2.2)
      const scores = data.options.map((o) => o.score).sort();
      if (data.options.length !== 5 || scores.join() !== '0,1,2,3,4') throw badRequest('Cada pergunta deve ter exatamente cinco alternativas, com notas de 0 a 4.', { options: 'Informe as cinco alternativas.' });
      for (const o of data.options) run('UPDATE answer_options SET description = ? WHERE question_id = ? AND score = ?', o.description, questionId, o.score);
    }
    if (data.references) {
      run('DELETE FROM question_framework_references WHERE question_id = ?', questionId);
      for (const r of data.references) run('INSERT OR IGNORE INTO question_framework_references (id, question_id, framework_reference_id) VALUES (?,?,?)', uuid(), questionId, upsertReference(r));
    }
  });
}

export function publishVersion(versionId) {
  const v = assertDraft(versionId);
  const full = getVersionFull(versionId);
  const bad = full.questions.filter((q) => q.options.length !== 5 || !q.title?.trim());
  if (bad.length) throw badRequest(`Perguntas incompletas: ${bad.map((q) => q.code).join(', ')}.`);
  tx(() => {
    // A versão anterior deixa de ser usada em novas avaliações, mas fica preservada (RF-019).
    run(`UPDATE instrument_versions SET status = 'RETIRED' WHERE instrument_id = ? AND status = 'PUBLISHED'`, v.instrument_id);
    run(`UPDATE instrument_versions SET status = 'PUBLISHED', published_at = ? WHERE id = ?`, nowIso(), versionId);
  });
}
