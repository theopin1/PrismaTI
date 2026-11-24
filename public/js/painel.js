import { get, post, $, esc, pct, dt, dtt, mountHeader, toast, STATUS_LABEL, STATUS_BADGE, ROLE_LABEL, LEVEL_COLOR } from './api.js';

const me = await mountHeader('painel');
if (me.is_platform_admin) location.href = '/admin.html';
const main = $('#main');

async function render() {
  const [company, list] = await Promise.all([get('/company'), get('/assessments')]);
  const current = list.items.find((a) => a.status === 'IN_PROGRESS');
  const finished = list.items.filter((a) => a.status === 'FINALIZED');
  let progress = null;
  if (current) progress = await get(`/assessments/${current.id}/progress`);
  const last = finished[0];
  const isGestor = me.role === 'GESTOR';

  main.innerHTML = `
    <div class="page-head">
      <div><span class="eyebrow">Painel da empresa</span><h1>Olá, ${esc(me.name.split(' ')[0])}.</h1>
      <p>${isGestor ? 'Acompanhe o diagnóstico de maturidade em TI da sua empresa, consulte resultados e relatórios.' : 'Você tem acesso de consulta: pode ver o questionário, as respostas, os resultados e os relatórios, e orientar o Gestor.'}</p></div>
    </div>
    <div class="grid2">
      <div class="stack">
        <section class="box">
          <div class="dim-head"><div><h2>Avaliação em andamento</h2><p class="muted small">Questionário com 30 perguntas em 7 dimensões. As respostas são salvas automaticamente.</p></div>
          ${current ? `<span class="badge blue">Em andamento</span>` : ''}</div>
          ${current ? `
            <div style="margin-top:22px">
              <div class="row"><span class="stat">${progress.answered}<span class="muted" style="font-size:18px"> / ${progress.total_questions}</span></span><span class="spacer"></span><span class="muted small">Preenchimento ${pct(progress.fill_percentage, 0)} · Cobertura ${pct(progress.coverage_percentage, 0)}</span></div>
              <div class="progress"><i style="width:${progress.fill_percentage}%"></i></div>
              <p class="small muted">Iniciada em ${dt(current.started_at)} · última alteração ${dtt(current.updated_at)}</p>
              <div class="row" style="margin-top:18px"><a class="btn btn-primary" href="/avaliacao.html?id=${current.id}">${isGestor ? (progress.answered ? 'Continuar diagnóstico' : 'Começar a responder') : 'Consultar respostas'} <span class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg></span></a></div>
            </div>` : `
            <div class="empty-state">${isGestor ? `<p>Nenhuma avaliação em andamento.</p><button class="btn btn-primary" id="start" style="margin-top:16px">Iniciar novo diagnóstico <span class="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 17 17 7M8 7h9v9"/></svg></span></button>` : '<p>Nenhuma avaliação em andamento. O Gestor da empresa inicia o diagnóstico.</p>'}</div>`}
        </section>
        <section class="box">
          <h2>Histórico de avaliações</h2>
          ${finished.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Finalizada em</th><th>Maturidade</th><th>Situação</th><th>Relatórios</th><th></th></tr></thead><tbody>
            ${finished.map((a) => `<tr><td>${dt(a.finalized_at)}<div class="small muted">Instrumento v${esc(a.version)}</div></td>
              <td><b style="color:${LEVEL_COLOR(a.overall_maturity)}">${pct(a.overall_maturity)}</b><div class="small muted">${esc(a.overall_classification || 'Indisponível')}</div></td>
              <td><span class="badge ${STATUS_BADGE[a.result_status]}">${STATUS_LABEL[a.result_status]}</span></td>
              <td>${a.reports}</td><td><a class="btn-sm ghost" href="/resultado.html?id=${a.id}">Ver resultado</a></td></tr>`).join('')}
          </tbody></table></div>` : '<p class="empty-state">As avaliações finalizadas aparecerão aqui, com seus resultados e relatórios.</p>'}
        </section>
      </div>
      <div class="stack">
        ${last ? `<section class="box"><p class="muted small">Último resultado</p><div class="stat" style="color:${LEVEL_COLOR(last.overall_maturity)}">${pct(last.overall_maturity)}</div><p><b>${esc(last.overall_classification || '')}</b></p><p class="small muted">Finalizada em ${dt(last.finalized_at)}</p><a class="btn-sm primary" style="margin-top:12px" href="/resultado.html?id=${last.id}">Abrir resultado e relatório</a></section>` : ''}
        <section class="box">
          <h3>${esc(company.trade_name || company.legal_name)}</h3>
          <p class="small muted">${[company.sector, company.company_size && `Porte ${company.company_size}`, company.employee_count_range && `${company.employee_count_range} colaboradores`].filter(Boolean).map(esc).join(' · ') || 'Dados cadastrais mantidos pela administração do PrismaTI.'}</p>
          <p class="small" style="margin-top:14px"><b>Equipe com acesso</b></p>
          ${company.team.map((t) => `<p class="small muted">${esc(t.name)} · ${ROLE_LABEL[t.role]}</p>`).join('')}
        </section>
        <section class="box">
          <h3>Como funciona</h3>
          <p class="small muted">1. Responda as 30 perguntas. Use "Não se aplica" (com justificativa) ou "Não sei informar" quando necessário.<br>2. Registre evidências se quiser (opcional).<br>3. Finalize para calcular a maturidade.<br>4. Solicite o relatório com recomendações, plano de ação e roadmap.</p>
          <p class="small muted" style="margin-top:10px">O resultado é orientativo e não representa auditoria ou certificação.</p>
        </section>
      </div>
    </div>`;

  $('#start')?.addEventListener('click', async () => {
    try { const r = await post('/assessments'); location.href = `/avaliacao.html?id=${r.id}`; } catch (e) { toast(e.message, true); }
  });
}
render().catch((e) => { main.innerHTML = `<div class="alert show">${esc(e.message)}</div>`; });
