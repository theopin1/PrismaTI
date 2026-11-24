import { get, post, $, esc, pct, dt, dtt, mountHeader, toast, STATUS_LABEL, STATUS_BADGE, JOB_LABEL, JOB_BADGE, LEVEL_COLOR } from './api.js';

const me = await mountHeader(null);
const main = $('#main');
const params = new URLSearchParams(location.search);
const id = params.get('id');
const isGestor = me.role === 'GESTOR';
const canPdf = isGestor || me.is_platform_admin;
let pollTimer = null;

const ANSWER_LABEL = { SCORE: null, NA: 'Não se aplica', NS: 'Não sei informar' };
const EV_LABEL = { ENVIADA: 'Evidência enviada', INDICADA: 'Evidência indicada', NAO_INFORMADA: 'Sem evidência' };
const prioClass = (p) => ({ Alta: 'alta', 'Média': 'media', Baixa: 'baixa' }[p] || 'baixa');

function gauge(p) {
  const r = 70, c = 2 * Math.PI * r, v = p ?? 0;
  return `<svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="Maturidade geral ${pct(p)}">
    <circle cx="85" cy="85" r="${r}" fill="none" stroke="#e8eef9" stroke-width="16"/>
    <circle cx="85" cy="85" r="${r}" fill="none" stroke="${LEVEL_COLOR(p)}" stroke-width="16" stroke-linecap="round"
      stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 85 85)"/>
  </svg>`;
}

function radar(dims) {
  const n = dims.length, cx = 160, cy = 150, R = 110;
  const pt = (i, f) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${dims.map((_, i) => pt(i, f).join(',')).join(' ')}" fill="none" stroke="#e3e9f5"/>`).join('');
  const axes = dims.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="#e3e9f5"/>`).join('');
  const shape = dims.map((d, i) => pt(i, (d.maturity_percentage ?? 0) / 100).join(',')).join(' ');
  const labels = dims.map((d, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${esc(d.code)}</text>`; }).join('');
  return `<svg class="radar" viewBox="0 0 320 300" width="100%" style="max-width:380px" role="img" aria-label="Radar de maturidade por dimensão">${rings}${axes}
    <polygon points="${shape}" fill="rgba(31,102,255,.18)" stroke="#1f66ff" stroke-width="2"/>${labels}</svg>`;
}

function resultsHtml(res, assessment) {
  const dims = res.dimensions;
  const valid = dims.filter((d) => d.maturity_percentage !== null);
  const sorted = [...valid].sort((a, b) => b.maturity_percentage - a.maturity_percentage);
  return `
    <div class="page-head">
      <div><span class="eyebrow">Resultado do diagnóstico</span><h1>Maturidade em TI</h1>
      <p>Avaliação finalizada em ${dt(assessment.finalized_at)} · Instrumento v${esc(res.instrument_version)} · Cálculo ${esc(res.calculation_version)}</p></div>
      <div class="res-actions"><a class="btn-sm ghost" href="${me.is_platform_admin ? '/admin.html' : '/painel.html'}">Voltar</a>${res.questions ? `<a class="btn-sm ghost" href="/avaliacao.html?id=${assessment.id}">Ver respostas</a>` : ''}<button class="btn-sm ghost" id="print">Imprimir</button></div>
    </div>
    ${params.get('novo') ? '<div class="ok-box show">Avaliação finalizada. Os resultados abaixo foram calculados pelo sistema e não mudam mais.</div>' : ''}
    <div class="res-hero">
      <section class="box gauge-wrap">
        <div style="position:relative;width:170px;height:170px">${gauge(res.overall_maturity)}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span class="big-pct" style="font-size:34px;color:${LEVEL_COLOR(res.overall_maturity)}">${pct(res.overall_maturity)}</span></div></div>
        <div><p class="muted small">Maturidade geral</p><h2 style="font-size:26px;margin-top:4px">Nível ${esc(res.overall_classification || 'indisponível')}</h2>
          <span class="level-pill" style="background:${LEVEL_COLOR(res.overall_maturity)}22;color:${LEVEL_COLOR(res.overall_maturity)}">${esc(res.overall_classification || 'Indisponível')}</span>
          <p style="margin-top:14px"><span class="badge ${STATUS_BADGE[res.result_status]}">${esc(STATUS_LABEL[res.result_status])}</span></p></div>
      </section>
      <section class="box kpis">
        <div class="kpi"><small>Cobertura</small><strong>${pct(res.overall_coverage)}</strong></div>
        <div class="kpi"><small>Preenchimento</small><strong>${pct(res.fill_percentage)}</strong></div>
        <div class="kpi"><small>Perguntas pontuadas</small><strong>${res.scored_count}/${res.total_questions}</strong></div>
        <div class="kpi"><small>Não se aplica · Não sei</small><strong>${res.na_count} · ${res.ns_count}</strong></div>
      </section>
    </div>
    ${res.result_status !== 'APTO_REVISAO' ? `<div class="alert show">${res.result_status === 'SEM_DADOS' ? 'Não há dados suficientes para um resultado confiável: há dimensões sem nenhuma pergunta pontuada.' : 'Resultado preliminar: a cobertura ficou abaixo de 80% ou alguma dimensão ficou sem pontuação. Interprete com cautela.'}</div>` : ''}

    <h2 class="section-title">Maturidade por dimensão</h2>
    <p class="section-sub">Percentual = soma das notas ÷ (perguntas pontuadas × 4). "Não se aplica" e "Não sei informar" ficam fora do cálculo.</p>
    <div class="dims-grid">
      <section class="box">${dims.map((d) => `<div class="bar-row"><div class="bar-top"><b>${esc(d.name)}</b><span>${d.maturity_percentage === null ? 'Indisponível' : `${pct(d.maturity_percentage)} · ${esc(d.classification)}`}</span></div>
        <div class="bar"><i style="width:${d.maturity_percentage ?? 0}%;background:${LEVEL_COLOR(d.maturity_percentage)}"></i></div>
        <p class="small muted" style="margin-top:6px">Cobertura ${pct(d.coverage_percentage, 0)} · ${d.scored_questions} de ${d.total_questions} perguntas pontuadas</p></div>`).join('')}</section>
      <section class="box" style="text-align:center">${radar(dims)}
        ${sorted.length ? `<p class="small muted" style="margin-top:10px">Mais madura: <b>${esc(sorted[0].name)}</b> · Menos madura: <b>${esc(sorted.at(-1).name)}</b></p>` : ''}</section>
    </div>
    ${res.questions ? questionsHtml(res.questions) : ''}
    <h2 class="section-title">Relatório com recomendações</h2>
    <p class="section-sub">Gerado por inteligência artificial a partir das respostas. Os números oficiais são sempre os calculados pelo sistema, acima.</p>
    <div id="reports"><p class="muted" style="margin-top:20px">Carregando relatórios...</p></div>
    <div id="report-view"></div>
    <p class="disclaimer">Este diagnóstico é orientativo e se baseia nas respostas declaradas pela empresa. Ele não representa auditoria, certificação ou conformidade com normas (ISO, LGPD, CIS, NIST ou outras). As referências a frameworks indicam apenas a origem das boas práticas avaliadas.</p>`;
}

function questionsHtml(qs) {
  const weak = qs.filter((q) => q.answer_type === 'SCORE' && q.score <= 1);
  return `
    <h2 class="section-title">Pontos de atenção declarados</h2>
    <p class="section-sub">Perguntas com nota 0 ou 1, conforme as respostas da empresa.</p>
    ${weak.length ? `<div class="risk-list">${weak.map((q) => `<div class="risk"><div class="risk-head"><span class="code">${esc(q.code)}</span>${esc(q.dimension_name)}<span class="prio alta">Nota ${q.score}</span></div>
      <h4>${esc(q.title)}</h4><p>${esc(q.selected_option || '')}</p>${q.first_recommendation ? `<p style="margin-top:6px"><b>Primeira ação sugerida:</b> ${esc(q.first_recommendation)}</p>` : ''}</div>`).join('')}</div>` : '<p class="muted" style="margin-top:16px">Nenhuma pergunta com nota 0 ou 1.</p>'}
    <details class="box" style="margin-top:22px"><summary style="cursor:pointer;font-weight:600">Ver todas as respostas (${qs.length})</summary>
      <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Pergunta</th><th>Resposta</th><th>Evidência</th><th>Referências</th></tr></thead><tbody>
      ${qs.map((q) => `<tr><td><span class="code">${esc(q.code)}</span> ${esc(q.title)}</td>
        <td>${q.answer_type === null ? '<span class="muted">Sem resposta</span>' : q.answer_type === 'SCORE' ? `<b>${q.score}</b> · <span class="small">${esc(q.selected_option || '')}</span>` : `${ANSWER_LABEL[q.answer_type]}${q.justification ? `<div class="small muted">${esc(q.justification)}</div>` : ''}`}</td>
        <td class="small">${EV_LABEL[q.evidence_status]}</td><td class="small muted">${q.references.map(esc).join(', ')}</td></tr>`).join('')}
      </tbody></table></div></details>`;
}

function reportHtml(rep) {
  const c = rep.content;
  const dimName = Object.fromEntries(rep.official_results.dimensions.map((d) => [d.code, d.name]));
  const recTitle = Object.fromEntries(c.recommendations.map((r) => [r.id, r.title]));
  return `
    <section class="box" style="margin-top:26px">
      <div class="dim-head"><div><p class="muted small">Relatório versão ${rep.report_version} · gerado em ${dtt(rep.generated_at)}</p><h2>Resumo executivo</h2></div>
        ${canPdf ? `<a class="btn-sm primary" href="/api/v1/reports/${rep.id}/pdf">Baixar PDF</a>` : '<span class="small muted">PDF disponível para o Gestor</span>'}</div>
      <p style="margin-top:12px">${esc(c.executive_summary)}</p>
      <h3 style="margin-top:22px">Interpretação da maturidade</h3><p class="muted">${esc(c.maturity_interpretation)}</p>
    </section>
    <h3 class="section-title" style="font-size:22px">Análise por dimensão</h3>
    <div class="dims-grid">${c.dimension_analysis.map((d) => `<section class="box"><h3>${esc(dimName[d.dimension_code] || d.dimension_code)}</h3><p class="small muted">${esc(d.interpretation)}</p>
      ${d.positive_practices.length ? `<p class="small" style="margin-top:10px"><b>Práticas positivas</b></p><ul class="small muted" style="padding-left:18px">${d.positive_practices.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${d.improvement_opportunities.length ? `<p class="small" style="margin-top:10px"><b>Oportunidades de melhoria</b></p><ul class="small muted" style="padding-left:18px">${d.improvement_opportunities.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`).join('')}</div>
    <div class="dims-grid">
      <div><h3 class="section-title" style="font-size:22px">Pontos fortes</h3><div class="rec-list">${c.strengths.map((s) => `<div class="rec"><div class="rec-head">${s.question_codes.map((q) => `<span class="code">${esc(q)}</span>`).join('')}</div><h4>${esc(s.title)}</h4><p>${esc(s.description)}</p></div>`).join('') || '<p class="muted">Nenhum ponto forte identificado.</p>'}</div></div>
      <div><h3 class="section-title" style="font-size:22px">Fragilidades</h3><div class="risk-list">${c.weaknesses.map((w) => `<div class="risk"><div class="risk-head">${w.question_codes.map((q) => `<span class="code">${esc(q)}</span>`).join('')}<span class="badge ${w.basis === 'Declarado' ? 'navy' : ''}">${esc(w.basis)}</span></div><h4>${esc(w.title)}</h4><p>${esc(w.description)}</p></div>`).join('')}</div></div>
    </div>
    <h3 class="section-title" style="font-size:22px">Recomendações priorizadas</h3>
    <div class="rec-list">${c.recommendations.map((r) => `<div class="rec"><div class="rec-head"><span class="prio ${prioClass(r.priority)}">Prioridade ${esc(r.priority)}</span>${esc(dimName[r.dimension_code] || r.dimension_code)} · ${r.question_codes.map((q) => `<span class="code">${esc(q)}</span>`).join(' ')}<span>Risco ${esc(r.risk)} · Impacto ${esc(r.impact)} · Esforço ${esc(r.effort)}</span></div>
      <h4>${esc(r.id)}. ${esc(r.title)}</h4><p><b>Fragilidade:</b> ${esc(r.weakness)}</p><p><b>Consequência possível:</b> ${esc(r.potential_consequence)}</p><p><b>Ação recomendada:</b> ${esc(r.recommended_action)}</p><p><b>Benefício esperado:</b> ${esc(r.expected_benefit)}</p><p class="small"><i>${esc(r.priority_justification)}</i></p></div>`).join('')}</div>
    <h3 class="section-title" style="font-size:22px">Plano de ação</h3>
    <div class="rec-list">${c.action_plan.map((a) => `<details class="rec"><summary style="cursor:pointer"><b>${esc(a.recommendation_id)}</b> · ${esc(a.what)}</summary>
      <p style="margin-top:10px"><b>Por quê:</b> ${esc(a.why)}</p><ol class="small muted" style="padding-left:18px;margin:8px 0">${a.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p><b>Quem executa:</b> ${esc(a.executor_profile)}</p><p><b>Recursos:</b> ${esc(a.resources)}</p><p><b>Benefício:</b> ${esc(a.expected_benefit)}</p><p><b>Evidência de conclusão:</b> ${esc(a.completion_evidence)}</p></details>`).join('')}</div>
    <h3 class="section-title" style="font-size:22px">Roadmap</h3>
    <div class="roadmap">${c.roadmap.map((p) => `<div class="phase"><small>${esc(p.period)}</small><h4>${esc(p.phase)}</h4><ul>${p.actions.map((a) => `<li>${esc(a.recommendation_id)}. ${esc(a.title || recTitle[a.recommendation_id] || '')}${a.depends_on.length ? `<span>Depende de ${a.depends_on.map(esc).join(', ')}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>
    <section class="box" style="margin-top:26px"><h3>Limitações</h3><ul class="small muted" style="padding-left:18px">${c.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <h3 style="margin-top:18px">Considerações finais</h3><p class="muted">${esc(c.final_considerations)}</p>
      <p class="small muted" style="margin-top:14px">Gerado por ${esc(rep.provider === 'local' ? 'gerador local (sem IA externa)' : rep.model_name)} · prompt ${esc(rep.prompt_version)} · esquema ${esc(rep.output_schema_version)}</p></section>`;
}

async function loadReports() {
  const box = $('#reports');
  const { reports, jobs } = await get(`/assessments/${id}/reports`);
  const active = jobs.find((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
  const lastFailed = jobs[0]?.status === 'FAILED' ? jobs[0] : null;
  box.innerHTML = `<section class="box" style="margin-top:20px">
    <div class="dim-head"><div><h3>Relatórios</h3><p class="small muted">${reports.length ? `${reports.length} versão(ões) gerada(s). Versões anteriores ficam preservadas.` : 'Nenhum relatório gerado ainda.'}</p></div>
      ${isGestor ? `<button class="btn-sm primary" id="req" ${active ? 'disabled' : ''}>${reports.length ? 'Gerar nova versão' : 'Solicitar relatório'}</button>` : ''}</div>
    ${active ? `<p style="margin-top:14px"><span class="badge blue">${JOB_LABEL[active.status]}</span> <span class="small muted">Solicitado em ${dtt(active.requested_at)}. A página atualiza sozinha.</span></p>` : ''}
    ${lastFailed ? `<div class="alert show">A geração falhou${lastFailed.error_code ? ` (${esc(lastFailed.error_code)})` : ''}. ${isGestor ? '<button class="btn-sm ghost" id="retry" style="margin-left:8px">Tentar novamente</button>' : 'O Gestor pode tentar novamente.'}</div>` : ''}
    ${reports.length ? `<div class="row" style="margin-top:14px">${reports.map((r, i) => `<button class="btn-sm ${i === 0 ? 'primary' : 'ghost'}" data-rep="${r.id}">v${r.report_version} · ${dt(r.generated_at)}</button>`).join('')}</div>` : ''}
    ${jobs.length ? `<details style="margin-top:14px"><summary class="small muted" style="cursor:pointer">Histórico de solicitações</summary><div class="tbl-wrap"><table class="tbl"><tbody>${jobs.map((j) => `<tr><td class="small">${dtt(j.requested_at)}</td><td><span class="badge ${JOB_BADGE[j.status]}">${JOB_LABEL[j.status]}</span></td><td class="small muted">${j.attempt_count} tentativa(s)${j.error_code ? ` · ${esc(j.error_code)}` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </section>`;

  $('#req')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await post(`/assessments/${id}/reports`); toast('Relatório solicitado. Isso pode levar alguns minutos.'); await loadReports(); } catch (err) { toast(err.message, true); e.target.disabled = false; }
  });
  $('#retry')?.addEventListener('click', async () => {
    try { await post(`/report-jobs/${lastFailed.id}/retry`); toast('Nova tentativa solicitada.'); await loadReports(); } catch (err) { toast(err.message, true); }
  });
  box.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('[data-rep]').forEach((x) => x.className = 'btn-sm ghost');
    b.className = 'btn-sm primary';
    showReport(b.dataset.rep);
  }));

  clearTimeout(pollTimer);
  if (active) pollTimer = setTimeout(() => loadReports().catch(() => {}), 4000);
  const current = $('#report-view').dataset.id;
  if (reports.length && current !== reports[0].id && !active) showReport(reports[0].id);
}

async function showReport(repId) {
  const view = $('#report-view');
  view.dataset.id = repId;
  view.innerHTML = '<p class="muted" style="margin-top:20px">Carregando relatório...</p>';
  try { view.innerHTML = reportHtml(await get(`/reports/${repId}`)); } catch (e) { view.innerHTML = `<div class="alert show">${esc(e.message)}</div>`; }
}

async function render() {
  if (!id) throw new Error('Avaliação não informada.');
  const [assessment, res] = await Promise.all([get(`/assessments/${id}`), get(`/assessments/${id}/results`)]);
  main.innerHTML = resultsHtml(res, assessment.assessment || assessment);
  $('#print').addEventListener('click', () => window.print());
  await loadReports();
}
render().catch((e) => { main.innerHTML = `<div class="alert show">${esc(e.message)}</div><p style="margin-top:16px"><a class="btn-sm ghost" href="/painel.html">Voltar ao painel</a></p>`; });
