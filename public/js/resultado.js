import { get, post, $, esc, pct, dt, dtt, mountHeader, toast, STATUS_LABEL, STATUS_BADGE, JOB_LABEL, JOB_BADGE, LEVEL_COLOR } from './api.js';

const me = await mountHeader('auto');
const main = $('#main');
const params = new URLSearchParams(location.search);
const id = params.get('id');
const isGestor = me.role === 'GESTOR';
const canPdf = isGestor || me.role === 'TI' || me.is_platform_admin;
let pollTimer = null;

const ANSWER_LABEL = { SCORE: null, NA: 'Não se aplica', NS: 'Não sei informar' };
const EV_LABEL = { ENVIADA: 'Evidência enviada', INDICADA: 'Evidência indicada', NAO_INFORMADA: 'Sem evidência' };

function gauge(p) {
  const r = 68, c = 2 * Math.PI * r, v = p ?? 0;
  return `<svg width="164" height="164" viewBox="0 0 164 164" role="img" aria-label="Maturidade geral ${pct(p)}">
    <circle cx="82" cy="82" r="${r}" fill="none" stroke="#eef5ff" stroke-width="15"/>
    <circle cx="82" cy="82" r="${r}" fill="none" stroke="${LEVEL_COLOR(p)}" stroke-width="15" stroke-linecap="round"
      stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 82 82)"/>
  </svg>`;
}

function radar(dims) {
  const n = dims.length, cx = 160, cy = 150, R = 110;
  const pt = (i, f) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${dims.map((_, i) => pt(i, f).join(',')).join(' ')}" fill="none" stroke="#dbe5f2"/>`).join('');
  const axes = dims.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="#dbe5f2"/>`).join('');
  const shape = dims.map((d, i) => pt(i, (d.maturity_percentage ?? 0) / 100).join(',')).join(' ');
  const labels = dims.map((d, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${esc(d.code)}</text>`; }).join('');
  return `<svg class="radar" viewBox="0 0 320 300" width="100%" style="max-width:380px" role="img" aria-label="Radar de maturidade por dimensão">${rings}${axes}
    <polygon points="${shape}" fill="rgba(23,105,255,.18)" stroke="#0b4ee8" stroke-width="2"/>${labels}</svg>`;
}

function resultsHtml(res, assessment) {
  const dims = res.dimensions;
  const valid = dims.filter((d) => d.maturity_percentage !== null);
  const sorted = [...valid].sort((a, b) => b.maturity_percentage - a.maturity_percentage);
  return `
    <div class="page-head">
      <div><span class="eyebrow">Resultado do diagnóstico</span><h1>Maturidade em TI</h1>
      <p>Avaliação finalizada em ${dt(assessment.finalized_at)} · Instrumento v${esc(res.instrument_version)} · Cálculo ${esc(res.calculation_version)}</p></div>
      <div class="res-actions"><a class="btn-sm ghost" href="${me.is_platform_admin ? '/admin.html#avaliacoes' : '/painel.html'}">Voltar</a>${res.questions ? `<a class="btn-sm soft" href="/avaliacao.html?id=${assessment.id}">Ver respostas</a>` : ''}</div>
    </div>
    ${params.get('novo') ? '<div class="ok-box show">Avaliação finalizada. Os resultados abaixo foram calculados pelo sistema e não mudam mais.</div>' : ''}
    <div class="res-hero" style="margin-top:0">
      <section class="box gauge-wrap">
        <div style="position:relative;width:164px;height:164px">${gauge(res.overall_maturity)}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span class="big-pct" style="font-size:32px;color:${LEVEL_COLOR(res.overall_maturity)}">${pct(res.overall_maturity)}</span></div></div>
        <div><span class="box-kicker">Maturidade geral</span><h2 style="font-size:24px;margin-top:2px">Nível ${esc(res.overall_classification || 'indisponível')}</h2>
          <span class="level-pill" style="background:${LEVEL_COLOR(res.overall_maturity)}22;color:${LEVEL_COLOR(res.overall_maturity)}">${esc(res.overall_classification || 'Indisponível')}</span>
          <p style="margin-top:14px"><span class="pill-dot ${STATUS_BADGE[res.result_status]}">${esc(STATUS_LABEL[res.result_status])}</span></p></div>
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
    <h2 class="section-title">Relatório em PDF</h2>
    <p class="section-sub">O relatório completo (resumo executivo, análise por dimensão, recomendações priorizadas, roadmap de 90 dias e plano de ação detalhado) é gerado sob demanda exclusivamente em PDF.</p>
    <div id="reports"><p class="muted" style="margin-top:20px">Carregando relatórios...</p></div>
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

async function loadReports() {
  const box = $('#reports');
  const { reports, jobs } = await get(`/assessments/${id}/reports`);
  const active = jobs.find((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
  const lastFailed = jobs[0]?.status === 'FAILED' ? jobs[0] : null;
  box.innerHTML = `<section class="box" style="margin-top:20px">
    <div class="dim-head">
      <div><span class="box-kicker">Documentos gerados</span><h3>Relatório de diagnóstico e plano de melhorias</h3>
      <p class="small muted">${reports.length ? `Última versão disponível: v${reports[0].report_version} · gerada em ${dtt(reports[0].generated_at)}` : 'Nenhum relatório em PDF gerado ainda para esta avaliação.'}</p></div>
      <div class="row">
        ${reports.length ? (canPdf ? `<a class="btn-sm ghost" href="/api/v1/reports/${reports[0].id}/pdf?inline=1" target="_blank" rel="noopener">Abrir PDF (v${reports[0].report_version})</a><a class="btn-sm primary" href="/api/v1/reports/${reports[0].id}/pdf">Baixar PDF (v${reports[0].report_version})</a>` : '<span class="small muted">Download em PDF disponível para o Gestor</span>') : ''}
        ${isGestor ? `<button class="${reports.length ? 'btn-sm ghost' : 'btn-cta'}" id="req" ${active ? 'disabled' : ''}>${reports.length ? 'Gerar nova versão' : 'Gerar relatório PDF'}</button>` : ''}
      </div>
    </div>
    ${active ? `<p style="margin-top:14px"><span class="pill-dot blue">${JOB_LABEL[active.status]}</span> <span class="small muted">Solicitado em ${dtt(active.requested_at)}. A página atualiza sozinha assim que o PDF estiver pronto.</span></p>` : ''}
    ${lastFailed ? `<div class="alert show">A geração falhou${lastFailed.error_code ? ` (${esc(lastFailed.error_code)})` : ''}. ${isGestor ? '<button class="btn-sm ghost" id="retry" style="margin-left:8px">Tentar novamente</button>' : 'O Gestor pode tentar novamente.'}</div>` : ''}
    ${reports.length ? `<div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Versão salva</th><th>Gerado em</th><th>Origem</th><th style="text-align:right">Ações</th></tr></thead><tbody>
      ${reports.map((r, i) => `<tr>
        <td><b>Relatório v${r.report_version}</b> ${i === 0 ? '<span class="pill-dot green" style="margin-left:6px">Mais recente</span>' : ''}</td>
        <td class="small">${dtt(r.generated_at)}</td>
        <td class="small muted">${r.provider === 'local' ? 'Gerador local' : esc(r.model_name)}</td>
        <td>${canPdf ? `<div class="row" style="justify-content:flex-end"><a class="btn-sm ghost" href="/api/v1/reports/${r.id}/pdf?inline=1" target="_blank" rel="noopener">Abrir PDF</a><a class="btn-sm soft" href="/api/v1/reports/${r.id}/pdf">Baixar PDF</a></div>` : '<span class="small muted">Disponível ao Gestor</span>'}</td>
      </tr>`).join('')}
    </tbody></table></div>` : ''}
    ${jobs.length ? `<details style="margin-top:14px"><summary class="small muted" style="cursor:pointer">Histórico de solicitações</summary><div class="tbl-wrap"><table class="tbl"><tbody>${jobs.map((j) => `<tr><td class="small">${dtt(j.requested_at)}</td><td><span class="pill-dot ${JOB_BADGE[j.status]}">${JOB_LABEL[j.status]}</span></td><td class="small muted">${j.attempt_count} tentativa(s)${j.error_code ? ` · ${esc(j.error_code)}` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
  </section>`;

  $('#req')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await post(`/assessments/${id}/reports`); toast('Geração do relatório PDF solicitada. Isso pode levar alguns instantes.'); await loadReports(); } catch (err) { toast(err.message, true); e.target.disabled = false; }
  });
  $('#retry')?.addEventListener('click', async () => {
    try { await post(`/report-jobs/${lastFailed.id}/retry`); toast('Nova tentativa solicitada.'); await loadReports(); } catch (err) { toast(err.message, true); }
  });

  clearTimeout(pollTimer);
  if (active) pollTimer = setTimeout(() => loadReports().catch(() => {}), 4000);
}

async function render() {
  if (!id) throw new Error('Avaliação não informada.');
  const [assessment, res] = await Promise.all([get(`/assessments/${id}`), get(`/assessments/${id}/results`)]);
  main.innerHTML = resultsHtml(res, assessment.assessment || assessment);
  await loadReports();
}
render().catch((e) => { main.innerHTML = `<div class="alert show">${esc(e.message)}</div><p style="margin-top:16px"><a class="btn-sm ghost" href="/painel.html">Voltar ao painel</a></p>`; });
