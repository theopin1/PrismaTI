// Exportação do relatório em PDF (RF-050, CA-MVP-15).
import PDFDocument from 'pdfkit';
import { STATUS_LABEL } from './calculation.js';

const BLUE = '#0b4fe8', NAVY = '#0a1a3d', MUTED = '#5b6880', LINE = '#dfe6f3';
const pct = (v) => (v === null || v === undefined ? 'indisponível' : `${Number(v).toFixed(1).replace('.', ',')}%`);
const clean = (s) => String(s ?? '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

export function renderReportPdf(stream, { company, assessment, results, report, reportMeta }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Relatório PrismaTI', Author: 'PrismaTI' } });
  doc.pipe(stream);
  const W = doc.page.width - 100;

  const h1 = (t) => { doc.moveDown(0.6).fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(clean(t)); doc.moveDown(0.3); };
  const h2 = (t) => { doc.moveDown(0.4).fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5).text(clean(t)); doc.moveDown(0.15); };
  const p = (t, opts = {}) => doc.fillColor(opts.color || '#23324f').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(clean(t), { align: 'left', ...opts });
  const bullet = (t) => { doc.fillColor('#23324f').font('Helvetica').fontSize(10).text(`•  ${clean(t)}`, { indent: 8 }); };
  const ensure = (h) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };

  // Capa / cabeçalho
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(20).text('PrismaTI', { continued: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Diagnóstico inicial de maturidade em TI');
  doc.moveDown(1);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('Relatório de maturidade em TI');
  doc.moveDown(0.3);
  p(`Empresa: ${company.trade_name || company.legal_name}`);
  p(`Avaliação finalizada em: ${new Date(assessment.finalized_at).toLocaleDateString('pt-BR')}`);
  p(`Instrumento: versão ${results.instrument_version}  ·  Cálculo: ${results.calculation_version}`);
  p(`Relatório: versão ${reportMeta.report_version}, gerado em ${new Date(reportMeta.generated_at).toLocaleString('pt-BR')} (${reportMeta.model_name})`, { color: MUTED, size: 9 });

  // Resultado oficial (valores do backend, nunca da IA)
  doc.moveDown(0.8);
  const boxY = doc.y;
  doc.roundedRect(50, boxY, W, 74, 8).fillAndStroke('#f3f7ff', LINE);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('MATURIDADE GERAL (RESULTADO OFICIAL)', 66, boxY + 12);
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(26).text(pct(results.overall_maturity), 66, boxY + 26);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(results.overall_classification || 'Indisponível', 230, boxY + 20);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
    .text(`Cobertura: ${pct(results.overall_coverage)}   ·   Preenchimento: ${pct(results.fill_percentage)}`, 230, boxY + 38)
    .text(`Situação: ${STATUS_LABEL[results.result_status]}`, 230, boxY + 52);
  doc.x = 50; doc.y = boxY + 90;

  h2('Maturidade por dimensão');
  for (const d of results.dimensions) {
    ensure(22);
    const y = doc.y;
    doc.fillColor(NAVY).font('Helvetica').fontSize(9.5).text(clean(d.name), 50, y, { width: 210 });
    doc.roundedRect(265, y + 2, 200, 7, 3).fill('#e8eef9');
    if (d.maturity_percentage !== null) doc.roundedRect(265, y + 2, Math.max(3, (200 * d.maturity_percentage) / 100), 7, 3).fill(BLUE);
    doc.fillColor(MUTED).fontSize(9).text(d.maturity_percentage === null ? 'Indisponível' : `${pct(d.maturity_percentage)} · ${d.classification}`, 475, y, { width: W - 425 });
    doc.x = 50; doc.y = y + 18;
  }

  h1('Resumo executivo'); p(report.executive_summary);
  h2('Interpretação da maturidade'); p(report.maturity_interpretation);

  h1('Análise por dimensão');
  const dimName = Object.fromEntries(results.dimensions.map((d) => [d.code, d.name]));
  for (const d of report.dimension_analysis) {
    ensure(60); h2(dimName[d.dimension_code] || d.dimension_code); p(d.interpretation);
    if (d.positive_practices.length) { p('Práticas positivas:', { bold: true, size: 9.5 }); d.positive_practices.forEach(bullet); }
    if (d.improvement_opportunities.length) { p('Oportunidades de melhoria:', { bold: true, size: 9.5 }); d.improvement_opportunities.forEach(bullet); }
  }

  if (report.strengths.length) { h1('Pontos fortes'); report.strengths.forEach((s) => bullet(`${s.title} (${s.question_codes.join(', ')}): ${s.description}`)); }

  h1('Fragilidades');
  if (!report.weaknesses.length) p('Nenhuma fragilidade relevante foi identificada nas respostas.');
  report.weaknesses.forEach((w) => { ensure(40); p(`${w.title}  [${w.question_codes.join(', ')} · ${w.basis}]`, { bold: true }); p(w.description); doc.moveDown(0.3); });

  h1('Recomendações priorizadas');
  for (const r of report.recommendations) {
    ensure(110);
    p(`${r.id} · ${r.title}`, { bold: true, size: 10.5 });
    p(`Prioridade ${r.priority}  ·  Risco ${r.risk}  ·  Impacto ${r.impact}  ·  Esforço ${r.effort}  ·  Perguntas: ${r.question_codes.join(', ')}`, { color: BLUE, size: 9 });
    p(`Fragilidade: ${r.weakness}`); p(`Consequência potencial: ${r.potential_consequence}`); p(`Ação recomendada: ${r.recommended_action}`);
    p(`Benefício esperado: ${r.expected_benefit}`); p(`Justificativa da prioridade: ${r.priority_justification}`, { color: MUTED, size: 9 });
    doc.moveDown(0.5);
  }

  h1('Plano de ação');
  for (const a of report.action_plan) {
    ensure(100);
    p(`${a.recommendation_id} · ${a.what}`, { bold: true });
    p(`Por quê: ${a.why}`);
    a.steps.forEach((s, i) => p(`${i + 1}. ${s}`, { indent: 10 }));
    p(`Quem pode executar: ${a.executor_profile}`); p(`Recursos: ${a.resources}`); p(`Evidência de conclusão: ${a.completion_evidence}`, { color: MUTED, size: 9 });
    doc.moveDown(0.5);
  }

  h1('Roadmap');
  for (const ph of report.roadmap) {
    ensure(50); h2(`${ph.phase} — ${ph.period}`);
    ph.actions.forEach((a) => bullet(`${a.recommendation_id} · ${a.title}${a.depends_on.length ? ` (depende de ${a.depends_on.join(', ')})` : ''}`));
  }

  h1('Limitações'); report.limitations.forEach(bullet);
  h1('Considerações finais'); p(report.final_considerations);

  doc.moveDown(1);
  p('Este relatório tem caráter orientativo. Não representa certificação oficial, não substitui auditorias especializadas, não garante ausência de riscos, não comprova automaticamente as respostas declaradas e não garante resultados específicos após a execução das recomendações.', { color: MUTED, size: 8.5 });
  doc.end();
}
