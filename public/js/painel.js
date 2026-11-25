import { get, post, $, $$, esc, pct, dt, dtShort, dtt, initials, mountHeader, setSidebarActive, toast, clearFormErrors, showFormErrors, fmtCnpj, STATUS_LABEL, STATUS_BADGE, ROLE_LABEL, LEVEL_COLOR } from './api.js';

let view = location.hash === '#perfil' ? 'perfil' : 'painel';
const me = await mountHeader(view, {
  onNavigate(k) {
    view = k === 'perfil' ? 'perfil' : 'painel';
    history.replaceState(null, '', view === 'perfil' ? '#perfil' : '#dashboard');
    render().catch((e) => { $('#main').innerHTML = `<div class="alert show">${esc(e.message)}</div>`; });
  },
});
if (me.is_platform_admin) location.href = '/admin.html';
const main = $('#main');

const IC = {
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  target: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg>',
  play: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><polygon points="6,4 20,12 6,20"/></svg>',
};

function kpiRingSvg(value) {
  const v = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const r = 26, c = 2 * Math.PI * r;
  return `<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="6"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 32 32)"/>
    <text x="32" y="36" text-anchor="middle" fill="#fff" font-size="11" font-weight="600" font-family="DM Sans, sans-serif">${value === null || value === undefined ? '—' : `${Math.round(v)}%`}</text>
  </svg>`;
}

async function renderProfile(company) {
  const cur = await get('/auth/me');
  const compName = company.trade_name || company.legal_name;
  const meta = [company.cnpj && `CNPJ ${fmtCnpj(company.cnpj)}`, company.sector, company.company_size && `Porte ${company.company_size}`, company.employee_count_range && `${company.employee_count_range} colaboradores`].filter(Boolean).join(' · ');

  main.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">Configurações</span>
        <h1>Meu perfil</h1>
        <p>Consulte os dados vinculados à sua conta PrismaTI.</p>
      </div>
      <button type="button" class="btn-sm ghost" id="go-dash">Voltar ao Dashboard</button>
    </div>

    <div class="grid2">
      <section class="profile-card">
        <div class="profile-head">
          <div class="profile-avatar">${esc(initials(compName))}</div>
          <div>
            <h2 style="font-size:22px">${esc(compName)}</h2>
            <p class="small muted">Conta empresarial · ${esc(ROLE_LABEL[me.role])}</p>
          </div>
        </div>
        <div class="profile-grid">
          <div class="profile-item"><small>Empresa</small><b>${esc(company.legal_name)}</b></div>
          <div class="profile-item"><small>Seu e-mail</small><b>${esc(me.email)}</b></div>
          <div class="profile-item"><small>Usuário</small><b>${esc(me.name)}</b></div>
          <div class="profile-item"><small>Perfil de acesso</small><b>${esc(ROLE_LABEL[me.role])}</b></div>
        </div>
        <div class="profile-item" style="margin-top:14px">
          <small>Dados cadastrais da organização</small>
          <b>${esc(meta || 'Mantidos pela administração do PrismaTI.')}</b>
        </div>
      </section>

      <div class="stack">
        <section class="box">
          <span class="box-kicker">Organização</span>
          <h3>Equipe com acesso</h3>
          <div class="stack" style="margin-top:14px">
            ${company.team.map((t) => `<div class="entity-cell"><div class="avatar-sq">${esc(initials(t.name))}</div><div><b>${esc(t.name)}</b><div class="small muted">${esc(ROLE_LABEL[t.role])}</div></div></div>`).join('')}
          </div>
        </section>

        <section class="box">
          <span class="box-kicker">Segurança</span>
          <h3>Verificação em duas etapas (MFA)</h3>
          <p class="small muted" style="margin-top:6px">${cur.mfa_enabled ? 'Ativa. Ao entrar, será pedido o código de 6 dígitos do aplicativo autenticador.' : 'Adicione uma camada extra de proteção com aplicativo autenticador (Google/Microsoft Authenticator).'}</p>
          ${cur.mfa_enabled ? `<form id="mf-off" style="margin-top:14px"><div class="field"><label>Digite o código de 6 dígitos para desativar</label><input name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div><div class="alert"></div><button class="btn-sm danger">Desativar MFA</button></form>`
            : `<button class="btn-sm soft" id="setup-mfa" style="margin-top:14px">Configurar agora</button><div id="mfa-box"></div>`}
        </section>
      </div>
    </div>`;

  $('#go-dash')?.addEventListener('click', () => {
    view = 'painel';
    setSidebarActive('painel');
    history.replaceState(null, '', '#dashboard');
    render();
  });

  $('#mf-off')?.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors($('#mf-off'));
    const code = e.target.code.value.trim();
    try { await post('/auth/mfa/disable', { code }); toast('Verificação em duas etapas desativada.'); renderProfile(company); } catch (err) { showFormErrors($('#mf-off'), err); }
  });

  $('#setup-mfa')?.addEventListener('click', async () => {
    try {
      const s = await post('/auth/mfa/setup');
      $('#mfa-box').innerHTML = `<p class="small" style="margin-top:14px">1. Escaneie o QR Code ou adicione a chave manual:</p>
        ${s.qr_svg ? `<div style="margin:12px 0;display:inline-block;padding:10px;border:1px solid #dbe5f2;border-radius:12px;background:#fff">${s.qr_svg}</div>` : ''}
        <p><span class="code">${esc(s.secret)}</span></p>
        <form id="mf-on" style="margin-top:12px"><div class="field"><label>2. Código de 6 dígitos</label><input name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></div><div class="alert"></div><button class="btn-sm primary">Ativar MFA</button></form>`;
      $('#mf-on').addEventListener('submit', async (e) => {
        e.preventDefault(); clearFormErrors($('#mf-on'));
        try { await post('/auth/mfa/enable', { code: e.target.code.value.trim() }); toast('Verificação em duas etapas ativada.'); renderProfile(company); } catch (err) { showFormErrors($('#mf-on'), err); }
      });
    } catch (e) { toast(e.message, true); }
  });
}

async function render() {
  const [company, list, repList] = await Promise.all([get('/company'), get('/assessments'), get('/reports')]);
  if (view === 'perfil') return renderProfile(company);

  const savedReports = repList.items || [];
  const current = list.items.find((a) => a.status === 'IN_PROGRESS');
  const finished = list.items.filter((a) => a.status === 'FINALIZED');
  let progress = null;
  if (current) progress = await get(`/assessments/${current.id}/progress`);
  const last = finished[0];
  const validScores = finished.filter((a) => a.overall_maturity !== null).map((a) => a.overall_maturity);
  const avgMaturity = validScores.length ? validScores.reduce((s, x) => s + x, 0) / validScores.length : null;
  const lastDate = last?.finalized_at || current?.updated_at;
  const daysAgo = lastDate ? Math.max(0, Math.floor((Date.now() - Date.parse(lastDate)) / 86400000)) : null;
  const isGestor = me.role === 'GESTOR';
  const compName = company.trade_name || company.legal_name;

  main.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">Bem-vindo(a)!</span>
        <h1>${esc(compName)}</h1>
        <p>${isGestor ? 'Acompanhe a maturidade da sua TI e evolua com mais clareza.' : 'Você tem acesso de consulta: veja diagnósticos, resultados e relatórios em PDF.'}</p>
      </div>
      ${current
        ? `<a class="btn-cta" href="/avaliacao.html?id=${current.id}">${IC.play} ${isGestor ? (progress.answered ? 'Continuar diagnóstico' : 'Começar diagnóstico') : 'Consultar respostas'}</a>`
        : (isGestor ? `<button class="btn-cta" id="start">${IC.plus} Começar diagnóstico</button>` : '<span class="pill-dot blue">Modo consulta (TI)</span>')}
    </div>

    <div class="kpi-grid">
      <article class="kpi-card">
        <div class="kpi-ic">${IC.doc}</div>
        <div class="kpi-body">
          <small>Relatórios gerados</small>
          <div class="kpi-num">${savedReports.length}</div>
          <div class="kpi-sub">${savedReports.length === 1 ? 'salvo em PDF' : 'salvos em PDF'}</div>
        </div>
        <div class="kpi-viz" aria-hidden="true">
          <svg width="36" height="40" viewBox="0 0 36 40"><rect x="0" y="24" width="6" height="16" rx="2.5" fill="#98c6ff"/><rect x="10" y="16" width="6" height="24" rx="2.5" fill="#98c6ff"/><rect x="20" y="8" width="6" height="32" rx="2.5" fill="#98c6ff"/><rect x="30" y="0" width="6" height="40" rx="2.5" fill="#1769ff"/></svg>
        </div>
      </article>
      <article class="kpi-card featured">
        <div class="kpi-ic">${IC.target}</div>
        <div class="kpi-body">
          <small>Maturidade média</small>
          <div class="kpi-num">${avgMaturity === null ? '—' : `${Math.round(avgMaturity)}<span class="unit">%</span>`}</div>
          <div class="kpi-sub">${esc(last?.overall_classification || 'aguardando finalização')}</div>
        </div>
        <div class="kpi-viz" aria-hidden="true">${kpiRingSvg(avgMaturity)}</div>
      </article>
      <article class="kpi-card">
        <div class="kpi-ic">${IC.clock}</div>
        <div class="kpi-body">
          <small>Último diagnóstico</small>
          <div class="kpi-num">${daysAgo === null ? '—' : (daysAgo === 0 ? 'Hoje' : daysAgo)}</div>
          <div class="kpi-sub">${daysAgo === null ? 'nenhum registro' : (daysAgo === 0 ? 'atualizado hoje' : (daysAgo === 1 ? 'dia atrás' : 'dias atrás'))}</div>
        </div>
        <div class="kpi-viz" aria-hidden="true">
          <svg width="86" height="32" viewBox="0 0 86 32" fill="none"><path d="M2 28 22 18l18 4 22-14 22-4" stroke="#1769ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </article>
    </div>

    ${current ? `
      <section class="box" style="margin-bottom:22px">
        <div class="box-head" style="margin-bottom:10px">
          <div><span class="box-kicker">Em andamento</span><h2>Questionário aberto · Instrumento v${esc(current.version)}</h2></div>
          <span class="pill-dot blue">${progress.answered} de ${progress.total_questions} respondidas (${pct(progress.fill_percentage, 0)})</span>
        </div>
        <div class="progress"><i style="width:${progress.fill_percentage}%"></i></div>
        <div class="row" style="margin-top:12px">
          <span class="small muted">Cobertura atual para cálculo: ${pct(progress.coverage_percentage, 0)} · atualizado em ${dtt(current.updated_at)}</span>
          <span class="spacer"></span>
          <a class="btn-sm primary" href="/avaliacao.html?id=${current.id}">${isGestor ? 'Continuar questionário' : 'Visualizar respostas'}</a>
        </div>
      </section>` : ''}

    <section class="box">
      <div class="box-head">
        <div><span class="box-kicker">Histórico</span><h2>Meus diagnósticos</h2></div>
        <span class="box-count">${list.items.length} diagnóstico(s)</span>
      </div>
      ${list.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Diagnóstico</th><th>Data</th><th>Maturidade</th><th>Status</th><th style="text-align:right">Ações</th></tr></thead><tbody>
        ${list.items.map((a, idx) => {
          const isOpen = a.status === 'IN_PROGRESS';
          const title = `Diagnóstico #${list.items.length - idx} — ${new Date(a.finalized_at || a.started_at).getFullYear()}`;
          const stClass = isOpen ? 'blue' : STATUS_BADGE[a.result_status];
          const stLabel = isOpen ? 'Em andamento' : STATUS_LABEL[a.result_status];
          return `<tr>
            <td><div class="entity-cell"><div class="doc-sq">${IC.doc}</div><div><b>${esc(title)}</b><div class="small muted">Instrumento v${esc(a.version)} · ${a.reports} relatório(s)</div></div></div></td>
            <td class="small muted">${dtShort(a.finalized_at || a.started_at)}</td>
            <td>${isOpen ? '<span class="muted small">Em preenchimento</span>' : `<b style="color:${LEVEL_COLOR(a.overall_maturity)}">${pct(a.overall_maturity)}</b> <span class="small muted">${esc(a.overall_classification || '')}</span>`}</td>
            <td><span class="pill-dot ${stClass}">${esc(stLabel)}</span></td>
            <td><div class="row" style="justify-content:flex-end">
              ${isOpen
                ? `<a class="btn-sm soft" href="/avaliacao.html?id=${a.id}">${IC.play} ${isGestor ? 'Continuar' : 'Abrir'}</a>`
                : `<a class="btn-sm soft" href="/resultado.html?id=${a.id}">Resultado</a>${a.latest_report_id ? `<a class="icon-btn" title="Abrir PDF" href="/api/v1/reports/${a.latest_report_id}/pdf?inline=1" target="_blank" rel="noopener">${IC.eye}</a><a class="icon-btn" title="Baixar PDF" href="/api/v1/reports/${a.latest_report_id}/pdf">${IC.down}</a>` : ''}`}
            </div></td>
          </tr>`;
        }).join('')}
      </tbody></table></div>` : `<div class="empty-state">${isGestor ? 'Nenhum diagnóstico ainda. Clique em <b>Começar diagnóstico</b> acima para iniciar o primeiro.' : 'As avaliações iniciadas pelo Gestor aparecerão aqui.'}</div>`}
    </section>

    <section class="box" style="margin-top:22px">
      <div class="box-head">
        <div><span class="box-kicker">Relatórios salvos</span><h2>Histórico de PDFs</h2></div>
        <span class="box-count">${savedReports.length} arquivo(s)</span>
      </div>
      ${savedReports.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Relatório</th><th>Gerado em</th><th>Maturidade</th><th style="text-align:right">Ações</th></tr></thead><tbody>
        ${savedReports.map((rp) => `<tr>
          <td><div class="entity-cell"><div class="doc-sq">${IC.doc}</div><div><b>Relatório v${rp.report_version}</b><div class="small muted">Avaliação de ${dt(rp.finalized_at)} · v${esc(rp.instrument_version)}</div></div></div></td>
          <td class="small muted">${dtt(rp.generated_at)}</td>
          <td><b style="color:${LEVEL_COLOR(rp.overall_maturity)}">${pct(rp.overall_maturity)}</b> <span class="small muted">${esc(rp.overall_classification || '')}</span></td>
          <td><div class="row" style="justify-content:flex-end">
            <a class="btn-sm ghost" href="/api/v1/reports/${rp.id}/pdf?inline=1" target="_blank" rel="noopener">${IC.eye} Abrir PDF</a>
            <a class="btn-sm primary" href="/api/v1/reports/${rp.id}/pdf">${IC.down} Baixar</a>
          </div></td>
        </tr>`).join('')}
      </tbody></table></div>` : '<p class="empty-state">Os relatórios em PDF gerados após a finalização aparecerão salvos aqui para você abrir ou baixar quando quiser.</p>'}
    </section>`;

  $('#start')?.addEventListener('click', async () => {
    try { const r = await post('/assessments'); location.href = `/avaliacao.html?id=${r.id}`; } catch (e) { toast(e.message, true); }
  });
}

window.addEventListener('hashchange', () => {
  view = location.hash === '#perfil' ? 'perfil' : 'painel';
  setSidebarActive(view);
  render().catch((e) => { main.innerHTML = `<div class="alert show">${esc(e.message)}</div>`; });
});

render().catch((e) => { main.innerHTML = `<div class="alert show">${esc(e.message)}</div>`; });
