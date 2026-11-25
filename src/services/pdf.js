// Exportação do relatório em PDF (RF-050, CA-MVP-15).
import PDFDocument from 'pdfkit';
import { STATUS_LABEL } from './calculation.js';

const NAVY = '#0a1a3d';
const NAVY_HEADER = '#0f2a52';
const BLUE = '#1f66ff';
const BLUE_DARK = '#0b4fe8';
const MUTED = '#5b6880';
const LINE = '#dfe6f3';
const TEXT = '#23324f';

const TINT_BLUE = '#eef4ff';
const TINT_GREEN = '#ecf8f1';
const TINT_AMBER = '#fff8ea';
const TINT_RED = '#fdecec';

const GREEN_TEXT = '#12a46b';
const AMBER_TEXT = '#b7791f';
const RED_TEXT = '#e5484d';

const pct = (v) => (v === null || v === undefined ? 'Indisponível' : `${Number(v).toFixed(2).replace('.', ',')}%`);
const pctFill = (v) => {
  if (v === null || v === undefined) return 'Indisponível';
  const n = Number(v);
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(2).replace('.', ',')}%`;
};
const clean = (s) => String(s ?? '')
  .replace(/≥/g, '>=')
  .replace(/≤/g, '<=')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'");

function levelColor(v) {
  if (v === null || v === undefined) return MUTED;
  if (v <= 20) return RED_TEXT;
  if (v <= 40) return '#d97706';
  if (v <= 60) return BLUE;
  if (v <= 80) return BLUE_DARK;
  return GREEN_TEXT;
}

function statusColors(status) {
  if (status === 'APTO_REVISAO') return { bg: '#dff5ea', fg: '#0f7a50' };
  if (status === 'SEM_DADOS') return { bg: TINT_RED, fg: RED_TEXT };
  return { bg: '#fef0d6', fg: '#9c6514' };
}

function prioColors(prio) {
  if (prio === 'Alta') return { bg: TINT_RED, fg: RED_TEXT };
  if (prio === 'Média') return { bg: '#fff4e0', fg: AMBER_TEXT };
  return { bg: '#e6f7ef', fg: GREEN_TEXT };
}

function drawLogo(doc, ox, oy, scale = 1.15) {
  const poly = (pts, color) => {
    doc.save();
    doc.moveTo(ox + pts[0][0] * scale, oy + pts[0][1] * scale);
    for (let i = 1; i < pts.length; i++) doc.lineTo(ox + pts[i][0] * scale, oy + pts[i][1] * scale);
    doc.closePath().fill(color);
    doc.restore();
  };
  poly([[13, 2], [2, 23], [12, 20]], '#1f66ff');
  poly([[13, 2], [12, 20], [24, 23]], '#0b3fc4');
  poly([[2, 23], [12, 20], [24, 23], [12, 25]], '#7fb0ff');
}

function drawDonut(doc, cx, cy, r, value) {
  doc.save().lineWidth(11).strokeColor('#e3ebf7').circle(cx, cy, r).stroke().restore();
  if (value !== null && value !== undefined && value > 0) {
    const color = levelColor(value);
    if (value >= 99.99) {
      doc.save().lineWidth(11).strokeColor(color).circle(cx, cy, r).stroke().restore();
    } else {
      const start = -Math.PI / 2;
      const sweep = (value / 100) * Math.PI * 2;
      const end = start + sweep;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      doc.save()
        .lineWidth(11)
        .lineCap('round')
        .strokeColor(color)
        .path(`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`)
        .stroke()
        .restore();
    }
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16)
    .text(pct(value), cx - 44, cy - 9, { width: 88, align: 'center', lineBreak: false });
}

export function renderReportPdf(stream, { company, assessment, results, report, reportMeta }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 106, bottom: 56, left: 40, right: 40 },
    bufferPages: true,
    info: { Title: 'Relatório PrismaTI', Author: 'PrismaTI' },
  });
  doc.pipe(stream);

  const LEFT = 40;
  const W = doc.page.width - 80;
  const companyName = company.trade_name || company.legal_name;
  const emissionDate = new Date(reportMeta.generated_at).toLocaleDateString('pt-BR');
  const cycleYear = new Date(assessment.finalized_at || reportMeta.generated_at).getFullYear();
  const docId = `PTI-${String(assessment.id).slice(0, 6).toUpperCase()}-v${reportMeta.report_version}`;

  const pageFooters = [];
  let firstPage = true;
  let currentSub = 'INTELIGÊNCIA PARA COMEÇAR A MELHORAR';
  let currentFooter = 'Relatório individual de maturidade';

  function newPage(subtitle, footerLabel) {
    if (!firstPage) doc.addPage();
    firstPage = false;
    currentSub = subtitle;
    currentFooter = footerLabel;
    const idx = pageFooters.length;
    pageFooters.push(footerLabel);

    // Cabeçalho institucional
    doc.save().rect(0, 0, doc.page.width, 86).fill(NAVY_HEADER).restore();
    drawLogo(doc, LEFT, 25, 1.15);

    doc.font('Helvetica-Bold').fontSize(17);
    doc.fillColor('#ffffff').text('Prisma', LEFT + 38, 22, { continued: true, lineBreak: false });
    doc.fillColor('#8fbfff').text('TI', { continued: false, lineBreak: false });

    doc.fillColor('#b9c8e6').font('Helvetica').fontSize(7.2)
      .text(clean(subtitle).toUpperCase(), LEFT + 38, 43, { width: 220, characterSpacing: 0.7 });

    if (idx === 0) {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
        .text('RELATÓRIO DE DIAGNÓSTICO', LEFT, 26, { width: W, align: 'right', characterSpacing: 0.5, lineBreak: false });
      doc.fillColor('#b9c8e6').font('Helvetica').fontSize(8)
        .text(clean(`Emitido em ${emissionDate} · ${docId}`), LEFT, 41, { width: W, align: 'right', lineBreak: false });
    } else {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5)
        .text(clean(companyName), LEFT, 26, { width: W, align: 'right', lineBreak: false });
      doc.fillColor('#b9c8e6').font('Helvetica').fontSize(8)
        .text(clean(`${emissionDate} · ${docId}`), LEFT, 41, { width: W, align: 'right', lineBreak: false });
    }

    doc.x = LEFT;
    doc.y = 104;
  }

  function ensure(h) {
    if (doc.y + h > doc.page.height - 64) {
      newPage(currentSub, currentFooter);
      return true;
    }
    return false;
  }

  function card(x, y, w, h, { fill = '#ffffff', stroke = LINE, radius = 8 } = {}) {
    doc.save().roundedRect(x, y, w, h, radius).fillAndStroke(fill, stroke).restore();
  }

  function eyebrow(label, title, sub) {
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
      .text(clean(label).toUpperCase(), LEFT, doc.y, { width: W, characterSpacing: 1.4 });
    doc.y += 4;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(19.5)
      .text(clean(title), LEFT, doc.y, { width: W });
    if (sub) {
      doc.y += 3;
      doc.fillColor(MUTED).font('Helvetica').fontSize(9.5)
        .text(clean(sub), LEFT, doc.y, { width: W });
    }
    doc.y += 12;
  }

  function sectionHeading(text) {
    ensure(26);
    const y = doc.y;
    doc.save().rect(LEFT, y + 1, 3, 10).fill(BLUE).restore();
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5)
      .text(clean(text).toUpperCase(), LEFT + 9, y + 1, { width: W - 9, characterSpacing: 0.9 });
    doc.y = y + 18;
  }

  function note(label, text, { fill = TINT_BLUE, bar = BLUE, stroke = '#d7e4fb' } = {}) {
    const full = clean(`${label} · ${text}`);
    doc.font('Helvetica').fontSize(8.5);
    const th = doc.heightOfString(full, { width: W - 26 });
    const h = Math.max(34, th + 16);
    ensure(h + 10);
    const y = doc.y;
    card(LEFT, y, W, h, { fill, stroke, radius: 6 });
    doc.save().rect(LEFT, y + 3, 3, h - 6).fill(bar).restore();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLUE_DARK)
      .text(clean(label), LEFT + 12, y + 9, { width: W - 24, continued: true });
    doc.font('Helvetica').fillColor('#34425f')
      .text(clean(` · ${text}`), { continued: false });
    doc.y = y + h + 10;
  }

  const measure = (txt, { font = 'Helvetica', size = 9, width = W, lineGap = 0 } = {}) => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(clean(txt), { width, lineGap });
  };

  // =========================================================================
  // 01 / VISÃO GERAL
  // =========================================================================
  newPage('INTELIGÊNCIA PARA COMEÇAR A MELHORAR', 'Relatório individual de maturidade');
  eyebrow(
    '01 / VISÃO GERAL',
    'Seu ponto de partida para uma TI mais organizada.',
    'Diagnóstico inicial de maturidade, recomendações orientativas e plano de melhorias.',
  );

  // Cartão de metadados da empresa
  const infoY = doc.y;
  const infoH = 44;
  card(LEFT, infoY, W, infoH, { fill: '#f8fbff', stroke: LINE });
  const colW = W / 3;
  const metaItems = [
    ['EMPRESA AVALIADA', companyName],
    ['CICLO', `Avaliação inicial · ${cycleYear} (v${results.instrument_version})`],
    ['EMISSÃO', emissionDate],
  ];
  metaItems.forEach(([k, v], i) => {
    const x = LEFT + i * colW + 14;
    if (i > 0) doc.save().moveTo(LEFT + i * colW, infoY + 8).lineTo(LEFT + i * colW, infoY + infoH - 8).lineWidth(0.7).strokeColor(LINE).stroke().restore();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(k, x, infoY + 9, { width: colW - 22, characterSpacing: 0.6, lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica').fontSize(9.5).text(clean(v), x, infoY + 21, { width: colW - 22, lineBreak: false });
  });
  doc.y = infoY + infoH + 10;

  // 4 cartões de KPI
  const kpiY = doc.y;
  const kpiGap = 10;
  const kpiW = (W - kpiGap * 3) / 4;
  const kpiH = 68;
  const answeredTotal = (results.scored_count || 0) + (results.na_count || 0) + (results.ns_count || 0);
  const sc = statusColors(results.result_status);

  // KPI 1: Maturidade geral
  card(LEFT, kpiY, kpiW, kpiH, { fill: TINT_BLUE, stroke: '#d6e4fc' });
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text('MATURIDADE GERAL', LEFT + 12, kpiY + 10, { width: kpiW - 24, characterSpacing: 0.5, lineBreak: false });
  doc.fillColor(BLUE_DARK).font('Helvetica-Bold').fontSize(17).text(pct(results.overall_maturity), LEFT + 12, kpiY + 23, { width: kpiW - 24, lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.8).text(clean(results.overall_classification || 'Indisponível'), LEFT + 12, kpiY + 46, { width: kpiW - 24 });

  // KPI 2: Cobertura
  const k2x = LEFT + (kpiW + kpiGap);
  card(k2x, kpiY, kpiW, kpiH, { fill: TINT_GREEN, stroke: '#cdeedd' });
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text('COBERTURA', k2x + 12, kpiY + 10, { width: kpiW - 24, characterSpacing: 0.5, lineBreak: false });
  doc.fillColor(GREEN_TEXT).font('Helvetica-Bold').fontSize(17).text(pct(results.overall_coverage), k2x + 12, kpiY + 23, { width: kpiW - 24, lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.3).text('Respostas numéricas entre aplicáveis', k2x + 12, kpiY + 44, { width: kpiW - 24 });

  // KPI 3: Preenchimento
  const k3x = LEFT + (kpiW + kpiGap) * 2;
  card(k3x, kpiY, kpiW, kpiH, { fill: '#ffffff', stroke: LINE });
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text('PREENCHIMENTO', k3x + 12, kpiY + 10, { width: kpiW - 24, characterSpacing: 0.5, lineBreak: false });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(17).text(pctFill(results.fill_percentage), k3x + 12, kpiY + 23, { width: kpiW - 24, lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(`${answeredTotal}/${results.total_questions} questões respondidas`, k3x + 12, kpiY + 46, { width: kpiW - 24 });

  // KPI 4: Qualidade dos dados
  const k4x = LEFT + (kpiW + kpiGap) * 3;
  card(k4x, kpiY, kpiW, kpiH, { fill: TINT_AMBER, stroke: '#f5e6c4' });
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text('QUALIDADE DOS DADOS', k4x + 12, kpiY + 10, { width: kpiW - 24, characterSpacing: 0.5, lineBreak: false });
  const statusLabel = clean(STATUS_LABEL[results.result_status] || results.result_status);
  doc.font('Helvetica-Bold').fontSize(8);
  const pillW = Math.min(kpiW - 24, doc.widthOfString(statusLabel) + 16);
  doc.save().roundedRect(k4x + 12, kpiY + 25, pillW, 17, 8.5).fill(sc.bg).restore();
  doc.fillColor(sc.fg).text(statusLabel, k4x + 12, kpiY + 29, { width: pillW, align: 'center', lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Indicador metodológico', k4x + 12, kpiY + 47, { width: kpiW - 24 });

  doc.y = kpiY + kpiH + 14;

  // Resumo Executivo + Rosca de Resultado Geral
  sectionHeading('RESUMO EXECUTIVO');
  const resY = doc.y;
  const leftW = W * 0.62 - 6;
  const rightW = W - leftW - 12;
  const rightX = LEFT + leftW + 12;
  const sumTextH = measure(report.executive_summary, { size: 9, width: leftW - 28, lineGap: 2 });
  const resH = Math.max(152, sumTextH + 74);

  card(LEFT, resY, leftW, resH, { fill: '#ffffff', stroke: LINE });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5).text('O que o diagnóstico indica', LEFT + 14, resY + 14, { width: leftW - 28 });
  doc.fillColor(TEXT).font('Helvetica').fontSize(9).text(clean(report.executive_summary), LEFT + 14, resY + 32, { width: leftW - 28, lineGap: 2 });

  // Tags no rodapé do cartão esquerdo
  const tagY = resY + resH - 28;
  const drawTag = (tx, label) => {
    doc.font('Helvetica-Bold').fontSize(7.5);
    const tw = doc.widthOfString(label) + 16;
    doc.save().roundedRect(tx, tagY, tw, 16, 8).fill(TINT_BLUE).restore();
    doc.fillColor(BLUE_DARK).text(label, tx, tagY + 4, { width: tw, align: 'center', lineBreak: false });
    return tx + tw + 6;
  };
  let nextTagX = drawTag(LEFT + 14, 'Avaliação declaratória');
  drawTag(nextTagX, clean(`PrismaTI v${results.instrument_version}`));

  card(rightX, resY, rightW, resH, { fill: '#ffffff', stroke: LINE });
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5)
    .text('RESULTADO GERAL', rightX, resY + 14, { width: rightW, align: 'center', characterSpacing: 0.7, lineBreak: false });
  const dCx = rightX + rightW / 2;
  const dCy = resY + 76;
  drawDonut(doc, dCx, dCy, 38, results.overall_maturity);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
    .text(clean(results.overall_classification || 'Indisponível'), rightX + 10, resY + resH - 24, { width: rightW - 20, align: 'center', lineBreak: false });

  doc.y = resY + resH + 14;

  // Leitura rápida
  sectionHeading('LEITURA RÁPIDA');
  const validDims = results.dimensions.filter((d) => d.maturity_percentage !== null);
  const sortedDims = [...validDims].sort((a, b) => a.maturity_percentage - b.maturity_percentage);
  const worstDim = sortedDims[0];
  const bestDim = sortedDims.at(-1);

  const quickRows = [
    ['Área que merece atenção prioritária', worstDim ? `${worstDim.name} · ${pct(worstDim.maturity_percentage)}` : 'Indisponível'],
    ['Maior resultado entre as dimensões', bestDim ? `${bestDim.name} · ${pct(bestDim.maturity_percentage)}` : 'Indisponível'],
    ['Respostas sem pontuação', `${results.na_count} NA justificadas · ${results.ns_count} NS`],
  ];
  const qrY = doc.y;
  const rowH = 26;
  const qrH = quickRows.length * rowH;
  card(LEFT, qrY, W, qrH, { fill: '#ffffff', stroke: LINE });
  quickRows.forEach(([k, v], i) => {
    const ry = qrY + i * rowH;
    if (i > 0) doc.save().moveTo(LEFT + 12, ry).lineTo(LEFT + W - 12, ry).lineWidth(0.6).strokeColor(LINE).stroke().restore();
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.8).text(clean(k), LEFT + 14, ry + 8, { width: W * 0.55, lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.8).text(clean(v), LEFT + 14, ry + 8, { width: W - 28, align: 'right', lineBreak: false });
  });
  doc.y = qrY + qrH + 12;

  note(
    'Nota importante',
    'O resultado é orientativo, baseado em respostas declaradas, e não equivale a auditoria, certificação ou conferência das evidências.',
  );

  // =========================================================================
  // 02 / DIMENSÕES
  // =========================================================================
  newPage('DIAGNÓSTICO DE MATURIDADE', 'Dimensões do diagnóstico');
  eyebrow(
    '02 / DIMENSÕES',
    'Entenda seus resultados.',
    'As sete dimensões têm o mesmo peso na maturidade geral, mesmo quando possuem quantidades diferentes de perguntas.',
  );

  sectionHeading('MATURIDADE POR DIMENSÃO');
  const dimsCardY = doc.y;
  const dimRowH = 34;
  const dimsCardH = results.dimensions.length * dimRowH + 10;
  card(LEFT, dimsCardY, W, dimsCardH, { fill: '#ffffff', stroke: LINE });

  results.dimensions.forEach((d, i) => {
    const ry = dimsCardY + 6 + i * dimRowH;
    if (i > 0) doc.save().moveTo(LEFT + 14, ry).lineTo(LEFT + W - 14, ry).lineWidth(0.5).strokeColor('#eef2f9').stroke().restore();
    const parts = [`${d.scored_questions}/${d.total_questions} respostas numéricas`];
    if (d.na_count > 0) parts.push(`${d.na_count} NA`);
    if (d.ns_count > 0) parts.push(`${d.ns_count} NS`);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.2).text(clean(d.name), LEFT + 14, ry + 6, { width: 205, lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.6).text(clean(parts.join(' · ')), LEFT + 14, ry + 19, { width: 205, lineBreak: false });

    const barX = LEFT + 230;
    const barW = 190;
    const barY = ry + 13;
    doc.save().roundedRect(barX, barY, barW, 7, 3.5).fill('#e8eef9').restore();
    if (d.maturity_percentage !== null && d.maturity_percentage > 0) {
      const fillW = Math.max(6, (barW * Math.min(100, d.maturity_percentage)) / 100);
      doc.save().roundedRect(barX, barY, fillW, 7, 3.5).fill(levelColor(d.maturity_percentage)).restore();
    }
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.2)
      .text(pct(d.maturity_percentage), barX + barW + 10, ry + 11, { width: W - 230 - barW - 24, align: 'right', lineBreak: false });
  });
  doc.y = dimsCardY + dimsCardH + 10;

  note(
    'Como ler',
    'A barra representa o percentual calculado a partir das respostas numéricas válidas. NA justificada sai do cálculo; NS reduz a cobertura. As barras não indicam conformidade certificada.',
    { fill: '#f6f9ff', bar: '#94a3b8', stroke: LINE },
  );

  // O que merece sua atenção (3 cards iguais)
  sectionHeading('O QUE MERECE SUA ATENÇÃO');
  const dimAnalysisByCode = Object.fromEntries((report.dimension_analysis || []).map((d) => [d.dimension_code, d]));
  const bestExtra = bestDim && dimAnalysisByCode[bestDim.code]?.positive_practices?.[0]
    ? ` Destaque em ${dimAnalysisByCode[bestDim.code].positive_practices[0]}.`
    : '';
  const worstExtra = worstDim && dimAnalysisByCode[worstDim.code]?.improvement_opportunities?.[0]
    ? ` Sugere priorizar ${dimAnalysisByCode[worstDim.code].improvement_opportunities[0]}.`
    : '';

  const attCards = [
    {
      title: 'Ponto relativamente mais forte',
      fill: TINT_GREEN,
      stroke: '#cdeedd',
      body: bestDim
        ? `${bestDim.name} apresenta o maior resultado relativo (${pct(bestDim.maturity_percentage)}). Há sinais de acompanhamento de algumas práticas, que podem servir de base para padronizar rotinas.${bestExtra}`
        : 'Não há dimensões com pontuação numérica válida para comparação.',
    },
    {
      title: 'Primeiro ponto de melhoria',
      fill: TINT_AMBER,
      stroke: '#f5e6c4',
      body: worstDim
        ? `${worstDim.name} registra o menor índice (${pct(worstDim.maturity_percentage)}).${worstExtra || ' Isso sugere priorizar práticas essenciais e definição de responsáveis nesta área.'}`
        : 'Não há dimensões com pontuação numérica válida para comparação.',
    },
    {
      title: 'Informações a confirmar',
      fill: TINT_BLUE,
      stroke: '#d6e4fc',
      body: results.ns_count > 0
        ? `Foram registradas ${results.ns_count} resposta(s) "Não sei informar". Elas não entram nas notas, mas reduzem a cobertura. Vale esclarecer essas respostas antes de planejar intervenções maiores.`
        : 'Todas as perguntas aplicáveis tiveram resposta numérica ou NA justificada, sem pendências do tipo "Não sei informar".',
    },
  ];

  const attGap = 10;
  const attW = (W - attGap * 2) / 3;
  const attHeights = attCards.map((c) => 36 + measure(c.body, { size: 8.3, width: attW - 22, lineGap: 1.5 }));
  const attH = Math.max(...attHeights, 92);
  ensure(attH + 14);
  const attY = doc.y;
  attCards.forEach((c, i) => {
    const cx = LEFT + i * (attW + attGap);
    card(cx, attY, attW, attH, { fill: c.fill, stroke: c.stroke });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(clean(c.title), cx + 11, attY + 11, { width: attW - 22 });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.3).text(clean(c.body), cx + 11, attY + 27, { width: attW - 22, lineGap: 1.5 });
  });
  doc.y = attY + attH + 14;

  // Melhoria: Interpretação da maturidade + Análise por dimensão
  if (report.maturity_interpretation) {
    const miH = 34 + measure(report.maturity_interpretation, { size: 8.8, width: W - 28, lineGap: 1.5 });
    ensure(miH + 26);
    sectionHeading('INTERPRETAÇÃO DA MATURIDADE');
    const miY = doc.y;
    card(LEFT, miY, W, miH, { fill: '#ffffff', stroke: LINE });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.8).text(clean(report.maturity_interpretation), LEFT + 14, miY + 12, { width: W - 28, lineGap: 1.5 });
    doc.y = miY + miH + 12;
  }

  const dimName = Object.fromEntries(results.dimensions.map((d) => [d.code, d.name]));
  if (report.dimension_analysis?.length) {
    ensure(120);
    sectionHeading('ANÁLISE POR DIMENSÃO');
    const daGap = 10;
    const daW = (W - daGap) / 2;
    const items = report.dimension_analysis;
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2);
      const heights = pair.map((d) => {
        const opps = (d.improvement_opportunities || []).slice(0, 2);
        const interpH = measure(d.interpretation, { size: 8.2, width: daW - 24, lineGap: 1.4 });
        const oppHs = opps.map((o) => measure(`• ${o}`, { size: 7.9, width: daW - 30 }));
        const totalOppH = oppHs.length ? oppHs.reduce((a, b) => a + b + 2.5, 13) : 0;
        return 28 + interpH + totalOppH + 8;
      });
      const rowH = Math.max(...heights);
      ensure(rowH + 8);
      const dy = doc.y;
      pair.forEach((d, colIdx) => {
        const dx = LEFT + colIdx * (daW + daGap);
        const title = dimName[d.dimension_code] || d.dimension_code;
        const opps = (d.improvement_opportunities || []).slice(0, 2);
        const interpH = measure(d.interpretation, { size: 8.2, width: daW - 24, lineGap: 1.4 });
        const oppHs = opps.map((o) => measure(`• ${o}`, { size: 7.9, width: daW - 30 }));
        card(dx, dy, daW, rowH, { fill: '#ffffff', stroke: LINE });
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.2).text(clean(title), dx + 12, dy + 10, { width: daW - 24 });
        let cy = dy + 24;
        doc.fillColor(TEXT).font('Helvetica').fontSize(8.2).text(clean(d.interpretation), dx + 12, cy, { width: daW - 24, lineGap: 1.4 });
        cy += interpH + 4;
        if (opps.length) {
          doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text('Oportunidades:', dx + 12, cy, { width: daW - 24 });
          cy += 10;
          opps.forEach((o, oIdx) => {
            doc.fillColor(TEXT).font('Helvetica').fontSize(7.9).text(clean(`• ${o}`), dx + 16, cy, { width: daW - 28 });
            cy += oppHs[oIdx] + 2.5;
          });
        }
      });
      doc.y = dy + rowH + 8;
    }
  }

  note(
    'Sobre as evidências',
    'Documentos ou descrições adicionados pelo gestor são registros declarados. No MVP, a plataforma não verifica automaticamente a autenticidade ou a suficiência dessas evidências.',
  );

  // =========================================================================
  // 03 / RECOMENDAÇÕES
  // =========================================================================
  newPage('RECOMENDAÇÕES ORIENTATIVAS', 'Recomendações geradas a partir do diagnóstico');
  eyebrow(
    '03 / RECOMENDAÇÕES',
    'Comece pelo que faz diferença.',
    'As prioridades são sugestões qualitativas de IA, considerando risco, impacto e esforço. Cada ação deve ser validada pela empresa.',
  );

  note(
    'Atenção',
    'As fragilidades são inferências baseadas nas respostas informadas, não constatações de auditoria. A prioridade alta não significa que houve incidente ou dano comprovado.',
  );

  const prioRank = { Alta: 0, Média: 1, Baixa: 2 };
  const recs = [...(report.recommendations || [])].sort(
    (a, b) => (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9) || String(a.id).localeCompare(String(b.id)),
  );
  const planByRec = Object.fromEntries((report.action_plan || []).map((a) => [a.recommendation_id, a]));

  for (const r of recs) {
    const deliverable = r.deliverable || planByRec[r.id]?.completion_evidence || 'Registro simples da ação realizada.';
    const subTitle = `${dimName[r.dimension_code] || r.dimension_code} · Perguntas: ${(r.question_codes || []).join(', ')}`;
    const metaLine = `Impacto: ${r.impact}   Esforço: ${r.effort}   Consequência potencial: ${r.potential_consequence}`;
    const colWidth = (W - 44) / 2;
    const titleH = measure(`${r.id} · ${r.title}`, { font: 'Helvetica-Bold', size: 10.5, width: W - 96 });
    const metaH = measure(metaLine, { font: 'Helvetica', size: 8.3, width: W - 28 });
    const leftTextH = measure(r.weakness, { font: 'Helvetica', size: 8.5, width: colWidth, lineGap: 1.5 });
    const rightTextH = measure(r.recommended_action, { font: 'Helvetica', size: 8.5, width: colWidth, lineGap: 1.5 });
    const colsH = Math.max(leftTextH, rightTextH) + 16;
    const delivH = measure(`Entrega sugerida: ${deliverable}`, { font: 'Helvetica', size: 8.2, width: W - 28 });
    const footH = Math.max(24, delivH + 12);

    const cardH = Math.max(28, titleH + 22) + 10 + metaH + 10 + colsH + 10 + footH;
    ensure(cardH + 10);

    const ry = doc.y;
    card(LEFT, ry, W, cardH, { fill: '#ffffff', stroke: LINE });

    // Cabeçalho do card
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.5)
      .text(clean(`${r.id} · ${r.title}`), LEFT + 14, ry + 12, { width: W - 96 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(clean(subTitle), LEFT + 14, ry + 14 + titleH, { width: W - 96 });

    // Pill de prioridade
    const pc = prioColors(r.priority);
    const pText = clean(r.priority).toUpperCase();
    doc.save().roundedRect(LEFT + W - 74, ry + 12, 60, 18, 9).fill(pc.bg).restore();
    doc.fillColor(pc.fg).font('Helvetica-Bold').fontSize(7.8)
      .text(pText, LEFT + W - 74, ry + 16.5, { width: 60, align: 'center', lineBreak: false });

    const headBottom = ry + Math.max(28, titleH + 22) + 8;
    doc.save().moveTo(LEFT + 14, headBottom).lineTo(LEFT + W - 14, headBottom).lineWidth(0.6).strokeColor('#eef2f9').stroke().restore();

    // Linha de risco/impacto/esforço/consequência
    const my = headBottom + 8;
    doc.font('Helvetica').fontSize(8.3).fillColor(MUTED).text('Impacto: ', LEFT + 14, my, { width: W - 28, continued: true });
    doc.font('Helvetica-Bold').fillColor(NAVY).text(clean(r.impact), { continued: true });
    doc.font('Helvetica').fillColor(MUTED).text('   Esforço: ', { continued: true });
    doc.font('Helvetica-Bold').fillColor(NAVY).text(clean(r.effort), { continued: true });
    doc.font('Helvetica').fillColor(MUTED).text('   Consequência potencial: ', { continued: true });
    doc.font('Helvetica-Bold').fillColor(NAVY).text(clean(r.potential_consequence), { continued: false });

    // Duas colunas: Leitura das respostas | Ação sugerida
    const cy = my + metaH + 8;
    const rx2 = LEFT + 14 + colWidth + 16;
    doc.save().moveTo(LEFT + 14 + colWidth + 8, cy).lineTo(LEFT + 14 + colWidth + 8, cy + colsH - 4).lineWidth(0.6).strokeColor('#eef2f9').stroke().restore();

    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.2).text('LEITURA DAS RESPOSTAS', LEFT + 14, cy, { width: colWidth, characterSpacing: 0.6 });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(clean(r.weakness), LEFT + 14, cy + 12, { width: colWidth, lineGap: 1.5 });

    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.2).text('AÇÃO SUGERIDA', rx2, cy, { width: colWidth, characterSpacing: 0.6 });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.5).text(clean(r.recommended_action), rx2, cy + 12, { width: colWidth, lineGap: 1.5 });

    // Rodapé do card: Entrega sugerida
    const fy = ry + cardH - footH;
    doc.save().rect(LEFT + 1, fy, W - 2, footH - 1).fill('#f6f9ff').restore();
    doc.save().moveTo(LEFT, fy).lineTo(LEFT + W, fy).lineWidth(0.6).strokeColor(LINE).stroke().restore();
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(NAVY).text('Entrega sugerida: ', LEFT + 14, fy + 7, { width: W - 28, continued: true });
    doc.font('Helvetica').fillColor(MUTED).text(clean(deliverable), { continued: false });

    doc.y = ry + cardH + 10;
  }

  // Pontos fortes identificados (melhoria sobre o modelo)
  if (report.strengths?.length) {
    const bulletHs = report.strengths.map((s) => measure(`• ${s.title} (${(s.question_codes || []).join(', ')})`, { size: 8.6, width: W - 28 }));
    const sh = 24 + bulletHs.reduce((a, b) => a + b + 4, 0);
    ensure(sh + 24);
    sectionHeading('PONTOS FORTES IDENTIFICADOS');
    const sy = doc.y;
    card(LEFT, sy, W, sh, { fill: TINT_GREEN, stroke: '#cdeedd' });
    let by = sy + 12;
    report.strengths.forEach((s, i) => {
      doc.fillColor(TEXT).font('Helvetica').fontSize(8.6)
        .text(clean(`• ${s.title} (${(s.question_codes || []).join(', ')})`), LEFT + 14, by, { width: W - 28 });
      by += bulletHs[i] + 4;
    });
    doc.y = sy + sh + 12;
  }

  // =========================================================================
  // 04 / PLANO DE AÇÃO (ROADMAP)
  // =========================================================================
  newPage('ROADMAP DE MELHORIA', 'Roadmap orientativo');
  eyebrow(
    '04 / PLANO DE AÇÃO',
    'Um caminho possível para melhorar.',
    'Roadmap sugerido para os próximos 90 dias. Prazos e recursos são ilustrativos e devem ser ajustados à realidade do negócio.',
  );

  sectionHeading('ROADMAP EM TRÊS ETAPAS');
  (report.roadmap || []).forEach((ph, idx) => {
    const leftColW = 115;
    const rightColX = LEFT + leftColW + 24;
    const rightColW = W - leftColW - 38;

    const prioList = (ph.actions || []).map((a) => a.recommendation_id).join(' · ');
    const leftTextH = measure(`Prioridades ${prioList}`, { size: 8, width: leftColW });
    const leftTotalH = 44 + leftTextH;

    const acts = ph.activities?.length ? ph.activities : (ph.actions || []).map((a) => a.title);
    const actHs = acts.map((t) => measure(`• ${t}`, { size: 8.6, width: rightColW }));
    const resLine = ph.expected_result ? `Resultado esperado: ${ph.expected_result}` : '';
    const resLineH = resLine ? measure(resLine, { size: 8.3, width: rightColW }) + 14 : 0;
    const rightTotalH = 26 + actHs.reduce((a, b) => a + b + 4, 0) + resLineH;

    const phH = Math.max(76, leftTotalH, rightTotalH) + 8;
    ensure(phH + 8);
    const py = doc.y;
    card(LEFT, py, W, phH, { fill: '#ffffff', stroke: LINE });

    // Coluna esquerda
    doc.fillColor(BLUE_DARK).font('Helvetica-Bold').fontSize(7.5)
      .text(`FASE ${String(idx + 1).padStart(2, '0')}`, LEFT + 14, py + 11, { width: leftColW, characterSpacing: 0.7 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13)
      .text(clean(ph.period), LEFT + 14, py + 23, { width: leftColW });
    if (prioList) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.8)
        .text(clean(`Prioridades ${prioList}`), LEFT + 14, py + 43, { width: leftColW });
    }

    doc.save().moveTo(LEFT + leftColW + 14, py + 10).lineTo(LEFT + leftColW + 14, py + phH - 10).lineWidth(0.7).strokeColor('#eef2f9').stroke().restore();

    // Coluna direita
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10.2)
      .text(clean(ph.phase), rightColX, py + 11, { width: rightColW });
    let ay = py + 27;
    acts.forEach((t, i) => {
      doc.fillColor(TEXT).font('Helvetica').fontSize(8.4).text(clean(`• ${t}`), rightColX, ay, { width: rightColW });
      ay += actHs[i] + 3;
    });
    if (ph.expected_result) {
      const erY = py + phH - resLineH - 2;
      doc.save().moveTo(rightColX, erY).lineTo(LEFT + W - 14, erY).dash(2, { space: 2 }).lineWidth(0.6).strokeColor(LINE).stroke().undash().restore();
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(NAVY).text('Resultado esperado: ', rightColX, erY + 5, { width: rightColW, continued: true });
      doc.font('Helvetica').fillColor(MUTED).text(clean(ph.expected_result), { continued: false });
    }

    doc.y = py + phH + 7;
  });

  // Para acompanhar a evolução
  const fu = report.follow_up || {
    who: 'O gestor da empresa, com apoio de pessoa responsável pela TI ou prestador autorizado. Os papéis são sugeridos, não atribuídos automaticamente.',
    how_to_prove: 'Guardar registros simples: listas de acessos, testes de restauração, inventário de sistemas e cadastro de fornecedores.',
    next_step: 'Escolha uma ação da primeira fase, defina um responsável e registre a data planejada. O diagnóstico deverá ser revisado depois da implementação das melhorias.',
  };

  const halfW = (W - 10) / 2;
  const whoH = 30 + measure(fu.who, { size: 8.3, width: halfW - 24, lineGap: 1.4 });
  const howH = 30 + measure(fu.how_to_prove, { size: 8.3, width: halfW - 24, lineGap: 1.4 });
  const twoH = Math.max(whoH, howH, 66);
  const nextH = 28 + measure(fu.next_step, { size: 8.3, width: W - 28, lineGap: 1.4 });
  ensure(twoH + nextH + 34);

  sectionHeading('PARA ACOMPANHAR A EVOLUÇÃO');
  const fy1 = doc.y;
  card(LEFT, fy1, halfW, twoH, { fill: '#f8fbff', stroke: LINE });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('Quem deve acompanhar?', LEFT + 12, fy1 + 10, { width: halfW - 24 });
  doc.fillColor(TEXT).font('Helvetica').fontSize(8.3).text(clean(fu.who), LEFT + 12, fy1 + 24, { width: halfW - 24, lineGap: 1.4 });

  card(LEFT + halfW + 10, fy1, halfW, twoH, { fill: '#f8fbff', stroke: LINE });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('Como comprovar cada passo?', LEFT + halfW + 22, fy1 + 10, { width: halfW - 24 });
  doc.fillColor(TEXT).font('Helvetica').fontSize(8.3).text(clean(fu.how_to_prove), LEFT + halfW + 22, fy1 + 24, { width: halfW - 24, lineGap: 1.4 });

  const fy2 = fy1 + twoH + 8;
  card(LEFT, fy2, W, nextH, { fill: TINT_BLUE, stroke: '#d6e4fc' });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('Próximo passo recomendado', LEFT + 14, fy2 + 9, { width: W - 28 });
  doc.fillColor(TEXT).font('Helvetica').fontSize(8.3).text(clean(fu.next_step), LEFT + 14, fy2 + 23, { width: W - 28, lineGap: 1.4 });
  doc.y = fy2 + nextH + 8;

  note(
    'Metodologia e limites',
    `Maturidade = média simples das dimensões com nota válida. Cobertura = respostas numéricas ÷ (${results.total_questions} - NA justificadas). Faixas: 0–20% Muito inicial; >20–40% Inicial; >40–60% Em desenvolvimento; >60–80% Estabelecido; >80–100% Avançado. Este material não substitui auditoria ou avaliação profissional especializada.`,
  );

  // =========================================================================
  // 05 / PLANO DE AÇÃO DETALHADO (APÊNDICE)
  // =========================================================================
  newPage('PLANO DE AÇÃO DETALHADO', 'Plano de ação detalhado');
  eyebrow(
    '05 / DETALHAMENTO',
    'Plano de ação e limitações.',
    'Passos operacionais sugeridos para cada recomendação, responsáveis indicativos, evidências de conclusão e ressalvas.',
  );

  sectionHeading('ATIVIDADES POR RECOMENDAÇÃO');
  for (const a of report.action_plan || []) {
    const title = `${a.recommendation_id} · ${a.what}`;
    const titleH = measure(title, { font: 'Helvetica-Bold', size: 9.8, width: W - 28 });
    const whyH = measure(`Por quê: ${a.why}`, { size: 8.4, width: W - 28 });
    const stepHs = (a.steps || []).map((s, i) => measure(`${i + 1}. ${s}`, { size: 8.3, width: W - 38 }));
    const stepsSum = stepHs.reduce((acc, h) => acc + h + 3, 0);
    const meta1 = `Quem pode executar: ${a.executor_profile}   ·   Recursos: ${a.resources}`;
    const meta1H = measure(meta1, { size: 8.1, width: W - 28 });
    const evH = measure(`Evidência de conclusão: ${a.completion_evidence}`, { size: 8.1, width: W - 28 });
    const ah = 18 + titleH + 6 + whyH + 6 + stepsSum + 6 + meta1H + 4 + evH + 10;

    ensure(ah + 8);
    const ay = doc.y;
    card(LEFT, ay, W, ah, { fill: '#ffffff', stroke: LINE });

    let cy = ay + 11;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.8).text(clean(title), LEFT + 14, cy, { width: W - 28 });
    cy += titleH + 5;
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.4).text(clean(`Por quê: ${a.why}`), LEFT + 14, cy, { width: W - 28 });
    cy += whyH + 5;
    (a.steps || []).forEach((s, i) => {
      doc.fillColor(TEXT).font('Helvetica').fontSize(8.3).text(clean(`${i + 1}. ${s}`), LEFT + 22, cy, { width: W - 38 });
      cy += stepHs[i] + 3;
    });
    cy += 4;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.1).text(clean(meta1), LEFT + 14, cy, { width: W - 28 });
    cy += meta1H + 3;
    doc.fillColor(BLUE_DARK).font('Helvetica').fontSize(8.1).text(clean(`Evidência de conclusão: ${a.completion_evidence}`), LEFT + 14, cy, { width: W - 28 });

    doc.y = ay + ah + 8;
  }

  if (report.limitations?.length) {
    const limHs = report.limitations.map((l) => measure(`• ${l}`, { size: 8.4, width: W - 28 }));
    const lh = 22 + limHs.reduce((a, b) => a + b + 4, 0);
    ensure(lh + 26);
    sectionHeading('LIMITAÇÕES DO DIAGNÓSTICO');
    const ly = doc.y;
    card(LEFT, ly, W, lh, { fill: '#f8fbff', stroke: LINE });
    let cy = ly + 11;
    report.limitations.forEach((l, i) => {
      doc.fillColor(TEXT).font('Helvetica').fontSize(8.4).text(clean(`• ${l}`), LEFT + 14, cy, { width: W - 28 });
      cy += limHs[i] + 4;
    });
    doc.y = ly + lh + 12;
  }

  if (report.final_considerations) {
    const fcH = 24 + measure(report.final_considerations, { size: 8.6, width: W - 28, lineGap: 1.5 });
    ensure(fcH + 62);
    sectionHeading('CONSIDERAÇÕES FINAIS');
    const fy = doc.y;
    card(LEFT, fy, W, fcH, { fill: '#ffffff', stroke: LINE });
    doc.fillColor(TEXT).font('Helvetica').fontSize(8.6).text(clean(report.final_considerations), LEFT + 14, fy + 12, { width: W - 28, lineGap: 1.5 });
    doc.y = fy + fcH + 12;
  }

  const disc = 'Este relatório tem caráter orientativo. Não representa certificação oficial, não substitui auditorias especializadas, não garante ausência de riscos, não comprova automaticamente as respostas declaradas e não garante resultados específicos após a execução das recomendações.';
  const discH = measure(disc, { size: 8, width: W });
  ensure(discH + 10);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(clean(disc), LEFT, doc.y, { width: W });

  // =========================================================================
  // Rodapé paginado em todas as páginas
  // =========================================================================
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  const totalStr = String(totalPages).padStart(2, '0');

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const footY = doc.page.height - 36;
    doc.save().moveTo(LEFT, footY - 8).lineTo(LEFT + W, footY - 8).lineWidth(0.6).strokeColor(LINE).stroke().restore();

    const label = pageFooters[i] || 'Relatório individual de maturidade';
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.8)
      .text(clean(`PrismaTI · ${label} · ${docId}`), LEFT, footY, { width: W - 165, lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
      .text('Avaliação declaratória', LEFT + W - 155, footY, { width: 100, align: 'right', lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8)
      .text(`${String(i + 1).padStart(2, '0')} / ${totalStr}`, LEFT, footY, { width: W, align: 'right', lineBreak: false });

    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}
