// Testes das fórmulas da Seção 6 (cenários da tabela 6.10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionPercentage, calculate, classify, validateForFinalization, round2 } from '../src/services/calculation.js';

const S = (score) => ({ type: 'SCORE', score });
const NA = { type: 'NA', justification: 'Não usamos esse serviço.' };
const NS = { type: 'NS' };

function oneDim(answers) {
  const dims = [{ id: 'd1', code: 'GOV', name: 'Gov' }];
  const qs = answers.map((_, i) => ({ id: `q${i}`, code: `P0${i + 1}`, dimension_id: 'd1' }));
  return calculate(dims, qs, Object.fromEntries(answers.map((a, i) => [`q${i}`, a])));
}

// 7 dimensões com 30 perguntas na distribuição oficial 4,4,5,4,5,5,3
function thirty(answerFor) {
  const sizes = [4, 4, 5, 4, 5, 5, 3];
  const dims = sizes.map((_, i) => ({ id: `d${i}`, code: `D${i}`, name: `Dim ${i}` }));
  const qs = []; let n = 0;
  sizes.forEach((s, di) => { for (let k = 0; k < s; k++) qs.push({ id: `q${n}`, code: `P${String(++n).padStart(2, '0')}`, dimension_id: `d${di}` }); });
  return { dims, qs, answers: Object.fromEntries(qs.map((q, i) => [q.id, answerFor(i, q)])) };
}

test('Nota individual 3 = 75%', () => assert.equal(questionPercentage(3), 75));
test('Notas 0..4 = 0/25/50/75/100%', () => assert.deepEqual([0, 1, 2, 3, 4].map(questionPercentage), [0, 25, 50, 75, 100]));
test('Nota fora de 0..4 é rejeitada', () => { assert.throws(() => questionPercentage(5)); assert.throws(() => questionPercentage(-1)); assert.throws(() => questionPercentage(2.5)); });

test('Quatro notas 3, 2, 1 e 2 = maturidade de 50%', () => {
  const r = oneDim([S(3), S(2), S(1), S(2)]);
  assert.equal(r.dimensions[0].maturity_percentage, 50);
});

test('Respostas 3, 1, NA e NS = maturidade 50% e cobertura 66,67%', () => {
  const r = oneDim([S(3), S(1), NA, NS]);
  assert.equal(r.dimensions[0].maturity_percentage, 50);
  assert.equal(round2(r.dimensions[0].coverage_percentage), 66.67);
  assert.equal(r.dimensions[0].fill_percentage, 100);
});

test('24 numéricas, 2 NA e 4 NS = cobertura 85,71% e preenchimento 100%', () => {
  const { dims, qs, answers } = thirty((i) => (i < 24 ? S(2) : i < 26 ? NA : NS));
  const r = calculate(dims, qs, answers);
  assert.equal(round2(r.overall_coverage), 85.71);
  assert.equal(r.fill_percentage, 100);
  assert.equal(r.scored_count, 24); assert.equal(r.na_count, 2); assert.equal(r.ns_count, 4);
});

test('Dimensão sem respostas numéricas = maturidade indisponível (não 0%) e fora da média', () => {
  const dims = [{ id: 'a', code: 'A', name: 'A' }, { id: 'b', code: 'B', name: 'B' }];
  const qs = [{ id: 'q1', code: 'P01', dimension_id: 'a' }, { id: 'q2', code: 'P02', dimension_id: 'b' }];
  const r = calculate(dims, qs, { q1: S(4), q2: NS });
  assert.equal(r.dimensions[1].maturity_percentage, null);
  assert.equal(r.dimensions[1].result_status, 'INDISPONIVEL');
  assert.equal(r.overall_maturity, 100);
  assert.equal(r.result_status, 'PRELIMINAR');
  assert.deepEqual(r.dimensions_without_data, ['B']);
});

test('Maturidade geral = média simples das dimensões (exemplo da Seção 6.4: 57,86%, Em desenvolvimento)', () => {
  const targets = [50, 65, 40, 75, 60, 45, 70];
  const dims = targets.map((_, i) => ({ id: `d${i}`, code: `D${i}`, name: `D${i}` }));
  const qs = [], answers = {};
  targets.forEach((t, di) => {
    let rest = (t / 100) * 80; // 20 perguntas x 4 pontos
    for (let k = 0; k < 20; k++) {
      const v = Math.min(4, rest); rest -= v;
      const id = `q${di}_${k}`; qs.push({ id, code: id, dimension_id: `d${di}` }); answers[id] = S(v);
    }
  });
  const r = calculate(dims, qs, answers);
  assert.deepEqual(r.dimensions.map((d) => d.maturity_percentage), targets);
  assert.equal(round2(r.overall_maturity), 57.86);
  assert.equal(r.overall_classification, 'Em desenvolvimento');
});

test('Faixas de classificação nos limites', () => {
  assert.equal(classify(0), 'Muito inicial'); assert.equal(classify(20), 'Muito inicial');
  assert.equal(classify(20.01), 'Inicial'); assert.equal(classify(40), 'Inicial');
  assert.equal(classify(40.5), 'Em desenvolvimento'); assert.equal(classify(60), 'Em desenvolvimento');
  assert.equal(classify(60.1), 'Estabelecido'); assert.equal(classify(80), 'Estabelecido');
  assert.equal(classify(80.1), 'Avançado'); assert.equal(classify(100), 'Avançado');
  assert.equal(classify(null), null);
});

test('Cobertura inferior a 80% = diagnóstico preliminar', () => {
  const { dims, qs, answers } = thirty((i) => (i % 3 === 0 ? NS : S(3)));
  const r = calculate(dims, qs, answers);
  assert.ok(r.overall_coverage < 80);
  assert.equal(r.result_status, 'PRELIMINAR');
});

test('Cobertura >= 80% e todas as dimensões com nota = apto à revisão', () => {
  const { dims, qs, answers } = thirty((i) => (i === 0 ? NS : S(2)));
  const r = calculate(dims, qs, answers);
  assert.equal(r.result_status, 'APTO_REVISAO');
  assert.equal(r.overall_maturity, 50);
});

test('Todas as respostas NS = sem dados suficientes, maturidade indisponível', () => {
  const { dims, qs, answers } = thirty(() => NS);
  const r = calculate(dims, qs, answers);
  assert.equal(r.result_status, 'SEM_DADOS');
  assert.equal(r.overall_maturity, null);
  assert.equal(r.overall_coverage, 0);
});

test('Todas NA = cobertura indisponível sem divisão por zero', () => {
  const r = oneDim([NA, NA]);
  assert.equal(r.dimensions[0].coverage_percentage, null);
  assert.equal(r.dimensions[0].maturity_percentage, null);
});

test('Pergunta vinculada a vários frameworks é contabilizada uma única vez', () => {
  const dims = [{ id: 'd', code: 'D', name: 'D' }];
  const q = { id: 'q1', code: 'P01', dimension_id: 'd' };
  // a mesma pergunta aparece duas vezes (ex.: duas referências) — deve contar só uma vez
  const r = calculate(dims, [q, q, { id: 'q2', code: 'P02', dimension_id: 'd' }], { q1: S(4), q2: S(0) });
  assert.equal(r.total_questions, 2);
  assert.equal(r.dimensions[0].maturity_percentage, 50);
});

test('Mesmas respostas e mesma metodologia = resultados idênticos', () => {
  const build = () => thirty((i) => (i % 5 === 0 ? NA : i % 7 === 0 ? NS : S(i % 5)));
  const a = build(), b = build();
  assert.deepEqual(calculate(a.dims, a.qs, a.answers), calculate(b.dims, b.qs, b.answers));
});

test('NA e NS nunca são convertidos em zero', () => {
  const r = oneDim([S(4), NA, NS]);
  assert.equal(r.dimensions[0].maturity_percentage, 100);
});

test('Finalização: rejeita sem resposta, alternativa inválida e NA sem justificativa', () => {
  const qs = [{ id: 'a', code: 'P01' }, { id: 'b', code: 'P02' }, { id: 'c', code: 'P03' }, { id: 'd', code: 'P04' }];
  const problems = validateForFinalization(qs, { a: S(2), b: { type: 'NA', justification: '  ' }, c: { type: 'SCORE', score: 7 } });
  assert.deepEqual(Object.keys(problems).sort(), ['P02', 'P03', 'P04']);
  assert.deepEqual(validateForFinalization(qs.slice(0, 1), { a: NS }), {});
});
