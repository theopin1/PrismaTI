// Motor de cálculo da Seção 6 — funções puras e determinísticas (RNF-041).
// Nenhuma dependência de banco, HTTP ou IA: recebe dimensões/perguntas/respostas e devolve números.

export const CALCULATION_VERSION = 'calc-1.0.0';
export const COVERAGE_THRESHOLD = 80; // % (Seção 6.7)

// 6.2 — Pontuação (%) = (Nota / 4) × 100
export function questionPercentage(score) {
  if (!Number.isInteger(score) || score < 0 || score > 4) throw new Error('Nota deve ser inteira entre 0 e 4');
  return (score / 4) * 100;
}

// 6.6 — faixas interpretativas
export function classify(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct <= 20) return 'Muito inicial';
  if (pct <= 40) return 'Inicial';
  if (pct <= 60) return 'Em desenvolvimento';
  if (pct <= 80) return 'Estabelecido';
  return 'Avançado';
}

// Valida uma resposta. NA/NS nunca viram zero (6.9).
export function normalizeAnswer(a) {
  if (!a || !a.type) return { type: 'NONE' };
  if (a.type === 'SCORE') {
    if (!Number.isInteger(a.score) || a.score < 0 || a.score > 4) return { type: 'INVALID' };
    return { type: 'SCORE', score: a.score };
  }
  if (a.type === 'NA') return { type: 'NA', justified: typeof a.justification === 'string' && a.justification.trim().length > 0 };
  if (a.type === 'NS') return { type: 'NS' };
  return { type: 'INVALID' };
}

function indicators(answers) {
  let sum = 0, scored = 0, na = 0, ns = 0, filled = 0;
  for (const raw of answers) {
    const a = normalizeAnswer(raw);
    if (a.type === 'SCORE') { sum += a.score; scored += 1; filled += 1; }
    else if (a.type === 'NA' && a.justified) { na += 1; filled += 1; }
    else if (a.type === 'NS') { ns += 1; filled += 1; }
  }
  const total = answers.length;
  const applicable = total - na;
  return {
    total, filled, scored, na, ns, sum, applicable,
    // 6.3 — Maturidade = soma / (respostas numéricas × 4) × 100, ou indisponível
    maturity: scored > 0 ? (sum / (scored * 4)) * 100 : null,
    // 6.5 — Preenchimento e cobertura (sem divisão por zero)
    fill: total > 0 ? (filled / total) * 100 : null,
    coverage: applicable > 0 ? (scored / applicable) * 100 : null,
  };
}

/**
 * @param dimensions [{ id, code, name }]
 * @param questions  [{ id, code, dimension_id }]  — cada pergunta conta uma única vez, mesmo com várias referências
 * @param answersByQuestion Map/obj questionId -> { type: 'SCORE'|'NA'|'NS', score?, justification? }
 */
export function calculate(dimensions, questions, answersByQuestion) {
  const get = (qid) => (answersByQuestion instanceof Map ? answersByQuestion.get(qid) : answersByQuestion[qid]);
  const seen = new Set();
  const uniqueQuestions = questions.filter((q) => (seen.has(q.id) ? false : seen.add(q.id)));

  const dims = dimensions.map((d) => {
    const qs = uniqueQuestions.filter((q) => q.dimension_id === d.id);
    const ind = indicators(qs.map((q) => get(q.id)));
    return {
      dimension_id: d.id, code: d.code, name: d.name,
      total_questions: ind.total,
      applicable_questions: ind.applicable,
      scored_questions: ind.scored,
      na_count: ind.na, ns_count: ind.ns,
      total_score: ind.sum,
      maturity_percentage: ind.maturity,
      classification: classify(ind.maturity),
      coverage_percentage: ind.coverage,
      fill_percentage: ind.fill ?? 0,
      result_status: ind.maturity === null ? 'INDISPONIVEL' : 'DISPONIVEL',
    };
  });

  const overallInd = indicators(uniqueQuestions.map((q) => get(q.id)));
  // 6.4 — média simples das dimensões válidas (pesos iguais)
  const valid = dims.filter((d) => d.maturity_percentage !== null);
  const overall = valid.length ? valid.reduce((s, d) => s + d.maturity_percentage, 0) / valid.length : null;

  // 6.7 — suficiência
  let status;
  if (overallInd.scored === 0) status = 'SEM_DADOS';
  else if ((overallInd.coverage ?? 0) >= COVERAGE_THRESHOLD && valid.length === dims.length) status = 'APTO_REVISAO';
  else status = 'PRELIMINAR';

  return {
    calculation_version: CALCULATION_VERSION,
    overall_maturity: overall,
    overall_classification: classify(overall),
    overall_coverage: overallInd.coverage,
    fill_percentage: overallInd.fill ?? 0,
    total_questions: overallInd.total,
    answered_count: overallInd.filled,
    scored_count: overallInd.scored,
    na_count: overallInd.na,
    ns_count: overallInd.ns,
    result_status: status,
    dimensions_without_data: dims.filter((d) => d.result_status === 'INDISPONIVEL').map((d) => d.code),
    dimensions: dims,
  };
}

// 5.5 — validação para finalizar: todas respondidas, NA justificadas, notas válidas.
export function validateForFinalization(questions, answersByQuestion) {
  const get = (qid) => (answersByQuestion instanceof Map ? answersByQuestion.get(qid) : answersByQuestion[qid]);
  const problems = {};
  for (const q of questions) {
    const a = normalizeAnswer(get(q.id));
    if (a.type === 'NONE') problems[q.code] = 'Pergunta sem resposta.';
    else if (a.type === 'INVALID') problems[q.code] = 'Alternativa inválida.';
    else if (a.type === 'NA' && !a.justified) problems[q.code] = 'Resposta "Não se aplica" exige justificativa.';
  }
  return problems;
}

export const STATUS_LABEL = {
  APTO_REVISAO: 'Apto à revisão',
  PRELIMINAR: 'Preliminar',
  SEM_DADOS: 'Sem dados suficientes',
};

export const round2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
