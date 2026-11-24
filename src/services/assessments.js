// Avaliações, respostas, progresso, finalização e resultados (Seções 3, 5 e 6).
import { one, all, run, tx } from '../db.js';
import { uuid, nowIso } from '../lib/util.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { getPublishedVersion, getVersionFull } from './instrument.js';
import { calculate, validateForFinalization, round2 } from './calculation.js';

export function startAssessment(user) {
  const version = getPublishedVersion();
  if (!version) throw conflict('Nenhuma versão do questionário está publicada.');
  const existing = one(`SELECT id FROM assessments WHERE company_id = ? AND status = 'IN_PROGRESS'`, user.companyId);
  if (existing) return { id: existing.id, existing: true };
  const id = uuid();
  try {
    run(`INSERT INTO assessments (id, company_id, manager_user_id, instrument_version_id, status, started_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      id, user.companyId, user.id, version.id, 'IN_PROGRESS', nowIso(), nowIso());
  } catch (e) {
    // Índice único parcial impede duas avaliações em andamento mesmo sob concorrência (CA-MVP-04).
    if (String(e.message).includes('UNIQUE')) {
      const again = one(`SELECT id FROM assessments WHERE company_id = ? AND status = 'IN_PROGRESS'`, user.companyId);
      return { id: again.id, existing: true };
    }
    throw e;
  }
  return { id, existing: false };
}

export function answersMap(assessmentId) {
  const rows = all(`SELECT aa.*, ao.score FROM assessment_answers aa LEFT JOIN answer_options ao ON ao.id = aa.answer_option_id WHERE aa.assessment_id = ?`, assessmentId);
  const m = new Map();
  for (const r of rows) m.set(r.question_id, { id: r.id, type: r.answer_type, score: r.score ?? undefined, option_id: r.answer_option_id, justification: r.justification, updated_at: r.updated_at });
  return m;
}

export function evidenceStatus(evidences) {
  if (evidences.some((e) => e.evidence_type === 'FILE')) return 'ENVIADA';
  if (evidences.length) return 'INDICADA';
  return 'NAO_INFORMADA';
}

export function getEvidencesByAnswer(assessmentId) {
  const rows = all(`SELECT e.id, e.assessment_answer_id, e.evidence_type, e.description, e.original_filename, e.mime_type, e.file_size, e.created_at
                    FROM evidences e JOIN assessment_answers aa ON aa.id = e.assessment_answer_id WHERE aa.assessment_id = ? ORDER BY e.created_at`, assessmentId);
  return rows.reduce((m, e) => ((m[e.assessment_answer_id] ||= []).push(e), m), {});
}

export function progress(assessment, version = getVersionFull(assessment.instrument_version_id)) {
  const answers = answersMap(assessment.id);
  const calc = calculate(version.dimensions, version.questions, Object.fromEntries([...answers].map(([k, v]) => [k, v])));
  return {
    total_questions: calc.total_questions,
    answered: calc.answered_count,
    fill_percentage: round2(calc.fill_percentage),
    coverage_percentage: round2(calc.overall_coverage),
    scored: calc.scored_count, na: calc.na_count, ns: calc.ns_count,
    pending: calc.total_questions - calc.answered_count,
    by_dimension: calc.dimensions.map((d) => ({
      code: d.code, name: d.name, total: d.total_questions,
      answered: Math.round((d.fill_percentage / 100) * d.total_questions),
      coverage_percentage: round2(d.coverage_percentage),
    })),
  };
}

export function getAssessmentDetail(assessment, { includeAnswers = true } = {}) {
  const version = getVersionFull(assessment.instrument_version_id);
  const company = one('SELECT id, legal_name, trade_name, sector, company_size, employee_count_range FROM companies WHERE id = ?', assessment.company_id);
  const manager = one('SELECT id, name FROM users WHERE id = ?', assessment.manager_user_id);
  const detail = { ...assessment, company, manager, instrument: { id: version.id, version: version.version }, progress: progress(assessment, version) };
  if (includeAnswers) {
    const answers = answersMap(assessment.id);
    const ev = getEvidencesByAnswer(assessment.id);
    detail.answers = Object.fromEntries(version.questions.map((q) => {
      const a = answers.get(q.id);
      if (!a) return [q.id, null];
      const evidences = ev[a.id] || [];
      return [q.id, { ...a, evidences, evidence_status: evidenceStatus(evidences) }];
    }));
  }
  return detail;
}

// RF-022/RF-023: salva uma resposta individual. Tipos: SCORE (0..4), NA (com justificativa ao finalizar), NS.
export function saveAnswer(assessment, user, questionId, body) {
  if (assessment.status !== 'IN_PROGRESS') throw conflict('A avaliação foi finalizada e não pode mais ser alterada.', 'ASSESSMENT_LOCKED');
  const q = one('SELECT id, code FROM questions WHERE id = ? AND instrument_version_id = ?', questionId, assessment.instrument_version_id);
  if (!q) throw badRequest('A pergunta não pertence à versão desta avaliação.', { questionId: 'Pergunta inválida.' });
  let optionId = null;
  if (body.type === 'SCORE') {
    const opt = one('SELECT id FROM answer_options WHERE question_id = ? AND score = ?', questionId, body.score);
    if (!opt) throw badRequest('Alternativa inválida.', { score: 'Escolha uma nota de 0 a 4.' });
    optionId = opt.id;
  }
  const justification = body.type === 'NA' ? (body.justification?.trim() || null) : (body.justification?.trim() || null);
  return tx(() => {
    // Recarrega o estado dentro da transação (evita salvar após uma finalização concorrente).
    const cur = one('SELECT status FROM assessments WHERE id = ?', assessment.id);
    if (cur.status !== 'IN_PROGRESS') throw conflict('A avaliação foi finalizada e não pode mais ser alterada.', 'ASSESSMENT_LOCKED');
    const existing = one('SELECT id FROM assessment_answers WHERE assessment_id = ? AND question_id = ?', assessment.id, questionId);
    const now = nowIso();
    if (existing) {
      run('UPDATE assessment_answers SET answer_type = ?, answer_option_id = ?, justification = ?, updated_by = ?, updated_at = ? WHERE id = ?',
        body.type, optionId, justification, user.id, now, existing.id);
    } else {
      run('INSERT INTO assessment_answers (id, assessment_id, question_id, answer_type, answer_option_id, justification, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        uuid(), assessment.id, questionId, body.type, optionId, justification, user.id, now);
    }
    run('UPDATE assessments SET updated_at = ? WHERE id = ?', now, assessment.id);
    return { question_code: q.code, saved_at: now, previous: existing ? 'updated' : 'created' };
  });
}

// RF-028 / 3.5: valida, bloqueia, calcula e armazena — de forma atômica e idempotente.
export function finalizeAssessment(assessment) {
  const version = getVersionFull(assessment.instrument_version_id);
  return tx(() => {
    const cur = one('SELECT * FROM assessments WHERE id = ?', assessment.id);
    if (cur.status === 'FINALIZED') {
      const existing = one('SELECT id FROM assessment_results WHERE assessment_id = ?', assessment.id);
      return { alreadyFinalized: true, resultId: existing?.id };
    }
    const answers = answersMap(assessment.id);
    const obj = Object.fromEntries(answers);
    const problems = validateForFinalization(version.questions, obj);
    if (Object.keys(problems).length) {
      throw badRequest(`Existem ${Object.keys(problems).length} pergunta(s) a corrigir antes de finalizar.`, problems);
    }
    const calc = calculate(version.dimensions, version.questions, obj);
    const now = nowIso();
    const resultId = uuid();
    run(`INSERT INTO assessment_results (id, assessment_id, instrument_version_id, calculation_version, overall_maturity, overall_classification, overall_coverage,
          fill_percentage, total_questions, answered_count, scored_count, na_count, ns_count, result_status, calculated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      resultId, assessment.id, version.id, calc.calculation_version, calc.overall_maturity, calc.overall_classification, calc.overall_coverage,
      calc.fill_percentage, calc.total_questions, calc.answered_count, calc.scored_count, calc.na_count, calc.ns_count, calc.result_status, now);
    for (const d of calc.dimensions) {
      run(`INSERT INTO dimension_results (id, assessment_result_id, dimension_id, maturity_percentage, classification, coverage_percentage, fill_percentage,
            total_questions, applicable_questions, scored_questions, total_score, result_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        uuid(), resultId, d.dimension_id, d.maturity_percentage, d.classification, d.coverage_percentage, d.fill_percentage,
        d.total_questions, d.applicable_questions, d.scored_questions, d.total_score, d.result_status);
    }
    run(`UPDATE assessments SET status = 'FINALIZED', finalized_at = ?, updated_at = ? WHERE id = ?`, now, now, assessment.id);
    return { alreadyFinalized: false, resultId };
  });
}

export function getResults(assessment) {
  const r = one('SELECT * FROM assessment_results WHERE assessment_id = ?', assessment.id);
  if (!r) throw notFound('Os resultados ficam disponíveis após a finalização da avaliação.');
  const dims = all(`SELECT dr.*, d.code, d.name, d.display_order FROM dimension_results dr JOIN dimensions d ON d.id = dr.dimension_id
                    WHERE dr.assessment_result_id = ? ORDER BY d.display_order`, r.id);
  return {
    ...r,
    dimensions: dims.map(({ display_order, ...d }) => d),
  };
}

// Visão detalhada por pergunta para a tela de resultados (fragilidades declaradas, sem inferência).
export function getQuestionBreakdown(assessment) {
  const version = getVersionFull(assessment.instrument_version_id);
  const answers = answersMap(assessment.id);
  const ev = getEvidencesByAnswer(assessment.id);
  const dimById = Object.fromEntries(version.dimensions.map((d) => [d.id, d]));
  return version.questions.map((q) => {
    const a = answers.get(q.id);
    return {
      code: q.code, theme: q.theme, title: q.title, dimension_code: dimById[q.dimension_id].code, dimension_name: dimById[q.dimension_id].name,
      answer_type: a?.type ?? null, score: a?.score ?? null, justification: a?.justification ?? null,
      selected_option: a?.score !== undefined ? q.options.find((o) => o.score === a.score)?.description : null,
      evidence_status: a ? evidenceStatus(ev[a.id] || []) : 'NAO_INFORMADA',
      first_recommendation: q.first_recommendation,
      references: q.references.map((r) => r.reference_code),
    };
  });
}
