import { get, post, patch, del, $, $$, esc, pct, dt, dtShort, dtt, initials, mountHeader, setSidebarActive, toast, modal, confirmDialog, showFormErrors, clearFormErrors, fmtCnpj, ROLE_LABEL, STATUS_LABEL, STATUS_BADGE, JOB_LABEL, JOB_BADGE } from './api.js';

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const VALID_TABS = ['empresas', 'usuarios', 'questionario', 'avaliacoes', 'relatorios', 'auditoria', 'conta'];
let tab = location.hash.slice(1) || 'empresas';
if (!VALID_TABS.includes(tab)) tab = 'empresas';

const me = await mountHeader(tab, {
  onNavigate(k) {
    tab = VALID_TABS.includes(k) ? k : 'empresas';
    history.replaceState(null, '', `#${tab}`);
    load();
  },
});
if (!me.is_platform_admin) location.href = '/painel.html';
const main = $('#main');

const ACC_BADGE = { ACTIVE: 'green', INACTIVE: 'red', PENDING: 'amber' };
const ACC_LABEL = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', PENDING: 'Pendente' };
const INV_LABEL = { PENDING: 'Pendente', ACCEPTED: 'Aceito', REVOKED: 'Revogado', EXPIRED: 'Expirado' };
const ASS_LABEL = { IN_PROGRESS: 'Em andamento', FINALIZED: 'Finalizada' };

const IC = {
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  building: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 11h2a2 2 0 0 1 2 2v8M2 21h20M8 7h2M12 7h2M8 11h2M12 11h2"/></svg>',
  users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17.5" cy="9.5" r="2.5"/></svg>',
  doc: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  power: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>',
  key: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L21 8l-3-3"/></svg>',
  eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
};

const HEADERS = {
  empresas: ['Painel administrativo', 'Gerenciamento de empresas', 'Gerencie os acessos e acompanhe as empresas cadastradas no PrismaTI.'],
  usuarios: ['Painel administrativo', 'Gerenciamento de usuários', 'Gerencie os usuários cadastrados e seus acessos ao PrismaTI.'],
  questionario: ['Painel administrativo', 'Gerenciamento de questionários', 'Gerencie os formulários de diagnóstico, suas versões e qual está sendo utilizada atualmente.'],
  avaliacoes: ['Painel administrativo', 'Avaliações', 'Acompanhe o progresso, maturidade e relatórios das avaliações iniciadas pelas empresas.'],
  relatorios: ['Painel administrativo', 'Relatórios de IA', 'Consulte os relatórios gerados, solicitações e consumo mensal de tokens.'],
  auditoria: ['Painel administrativo', 'Auditoria', 'Rastreabilidade completa de acessos, alterações administrativas e exportações.'],
  conta: ['Configurações', 'Minha conta', 'Gerencie a verificação em duas etapas (MFA) da sua conta administrativa.'],
};

function renderFrame(key, ctaHtml = '') {
  const [eyebrow, title, sub] = HEADERS[key];
  main.innerHTML = `<div class="page-head">
      <div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
      <div id="head-action">${ctaHtml}</div>
    </div>
    <div id="pane"><p class="muted">Carregando...</p></div>`;
  return $('#pane');
}

async function load() {
  setSidebarActive(tab);
  try {
    await VIEWS[tab]();
  } catch (e) {
    if (e.code === 'MFA_SETUP_REQUIRED') { tab = 'conta'; history.replaceState(null, '', '#conta'); return load(); }
    main.innerHTML = `<div class="alert show">${esc(e.message)}</div>`;
  }
}

function pager(data, onPage) {
  const el = document.createElement('div');
  el.className = 'pager';
  el.innerHTML = `<span>${data.total} registro(s) · página ${data.page} de ${data.totalPages}</span>
    <button class="btn-sm ghost" data-p="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Anterior</button>
    <button class="btn-sm ghost" data-p="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>Próxima</button>`;
  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
  return el;
}

const field = (name, label, attrs = '', hint = '') => `<div class="field"><label>${label}</label><input name="${name}" ${attrs}>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const select = (name, label, opts, val = '') => `<div class="field"><label>${label}</label><select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
const formData = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

// ---------- Empresas ----------
function companyForm(c = {}) {
  return `<form id="cform">
    ${field('legal_name', 'Razão social *', `value="${esc(c.legal_name || '')}" required`)}
    ${field('trade_name', 'Nome fantasia', `value="${esc(c.trade_name || '')}"`)}
    ${field('cnpj', 'CNPJ', `value="${esc(c.cnpj || '')}" inputmode="numeric" placeholder="00.000.000/0000-00" maxlength="18"`, 'Opcional. 14 dígitos válidos.')}
    ${field('sector', 'Setor', `value="${esc(c.sector || '')}"`)}
    <div class="grid2" style="gap:12px">${select('company_size', 'Porte', [['', '—'], ['Micro', 'Micro'], ['Pequena', 'Pequena'], ['Média', 'Média']], c.company_size || '')}
    ${select('employee_count_range', 'Colaboradores', [['', '—'], ['1-9', '1 a 9'], ['10-49', '10 a 49'], ['50-99', '50 a 99'], ['100-249', '100 a 249'], ['250+', '250 ou mais']], c.employee_count_range || '')}</div>
    ${field('contact_email', 'E-mail de contato', `type="email" value="${esc(c.contact_email || '')}"`)}
    <div class="alert"></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Salvar</button></div></form>`;
}

function openCompanyForm(c, after) {
  const m = modal(`<h3>${c ? 'Editar empresa' : 'Nova empresa'}</h3>${companyForm(c || {})}`);
  const form = $('#cform', m.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(form);
    try {
      const body = formData(form);
      const saved = c ? await patch(`/admin/companies/${c.id}`, body) : await post('/admin/companies', body);
      m.close(); toast('Empresa salva.'); after(saved);
    } catch (err) { showFormErrors(form, err); }
  });
}

async function viewEmpresas(p = 1, q = '') {
  const pane = renderFrame('empresas', `<button class="btn-cta" id="new">${IC.plus} Criar acesso</button>`);
  pane.innerHTML = `<section class="box">
    <div class="box-head">
      <div><span class="box-kicker">Empresas cadastradas</span><h2>Acessos ativos</h2></div>
      <span class="box-count" id="co-count">—</span>
    </div>
    <input id="q" class="search-input" placeholder="Buscar por nome ou CNPJ" value="${esc(q)}" style="max-width:360px">
    <div id="tbl-area"><p class="muted">Carregando...</p></div>
  </section>`;

  async function loadList(page = 1) {
    q = $('#q', pane).value;
    const data = await get(`/admin/companies?page=${page}&q=${encodeURIComponent(q)}`);
    $('#co-count', pane).textContent = `${data.total} empresa(s)`;
    const area = $('#tbl-area', pane);
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome da empresa</th><th>CNPJ</th><th>Data de criação</th><th>Associados</th><th>Situação</th><th style="text-align:right">Ações</th></tr></thead><tbody>
      ${data.items.map((c) => `<tr>
        <td><div class="entity-cell"><div class="doc-sq">${IC.building}</div><div><b>${esc(c.trade_name || c.legal_name)}</b><div class="small muted">${esc(c.legal_name)}</div></div></div></td>
        <td class="small muted">${esc(fmtCnpj(c.cnpj))}</td>
        <td class="small muted">${dtShort(c.created_at)}</td>
        <td><span class="assoc-cell">${IC.users} ${c.active_users}</span></td>
        <td><span class="pill-dot ${ACC_BADGE[c.status]}">${ACC_LABEL[c.status]}</span></td>
        <td><div class="row" style="justify-content:flex-end">
          <button class="icon-btn" data-open="${c.id}" title="Abrir detalhes e convites">${IC.eye}</button>
          <button class="icon-btn ${c.status === 'ACTIVE' ? 'danger' : ''}" data-co-toggle="${c.id}" data-to="${c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}" title="${c.status === 'ACTIVE' ? 'Inativar empresa' : 'Reativar empresa'}">${IC.power}</button>
        </div></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma empresa cadastrada.</td></tr>'}
      </tbody></table></div>`;
    area.appendChild(pager(data, loadList));
    $$('[data-open]', area).forEach((b) => b.addEventListener('click', () => companyDetail(pane, b.dataset.open)));
    $$('[data-co-toggle]', area).forEach((b) => b.addEventListener('click', async () => {
      const off = b.dataset.to === 'INACTIVE';
      if (off && !(await confirmDialog('Inativar empresa?', 'Os usuários perdem o acesso imediatamente. O histórico é preservado.', 'Inativar'))) return;
      try { await patch(`/admin/companies/${b.dataset.coToggle}/status`, { status: b.dataset.to }); toast('Situação atualizada.'); loadList(page); } catch (e) { toast(e.message, true); }
    }));
  }

  $('#q', pane).addEventListener('input', debounce(() => loadList(1)));
  $('#new').addEventListener('click', () => openCompanyForm(null, (c) => companyDetail(pane, c.id)));
  await loadList(p);
}

async function companyDetail(pane, id) {
  const c = await get(`/admin/companies/${id}`);
  const u = c.ai_usage;
  $('#head-action').innerHTML = `<button class="btn-sm ghost" id="back">${IC.back} Empresas</button>`;
  pane.innerHTML = `<div class="grid2"><div class="stack">
      <section class="box">
        <div class="dim-head">
          <div class="entity-cell"><div class="doc-sq" style="width:44px;height:44px">${IC.building}</div><div><h2>${esc(c.trade_name || c.legal_name)}</h2><p class="small muted">${esc(c.legal_name)}${c.cnpj ? ` · CNPJ ${esc(fmtCnpj(c.cnpj))}` : ''}</p></div></div>
          <span class="pill-dot ${ACC_BADGE[c.status]}">${ACC_LABEL[c.status]}</span>
        </div>
        <p class="small muted" style="margin-top:12px">${[c.sector, c.company_size, c.employee_count_range && `${c.employee_count_range} colaboradores`, c.contact_email].filter(Boolean).map(esc).join(' · ') || 'Sem dados complementares.'}</p>
        <div class="row" style="margin-top:16px"><button class="btn-sm soft" id="edit">${IC.edit} Editar dados</button>
          <button class="btn-sm ${c.status === 'ACTIVE' ? 'danger' : 'primary'}" id="toggle">${c.status === 'ACTIVE' ? 'Inativar empresa' : 'Reativar empresa'}</button></div>
      </section>
      <section class="box"><span class="box-kicker">Equipe</span><h3>Usuários vinculados</h3>
        <div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Nome</th><th>Perfil</th><th>Conta</th><th></th></tr></thead><tbody>
        ${c.users.map((x) => `<tr><td><div class="entity-cell"><div class="avatar-sq">${esc(initials(x.name))}</div><div><b>${esc(x.name)}</b><div class="small muted">${esc(x.email)}</div></div></div></td><td class="small">${ROLE_LABEL[x.role]}${x.membership_status !== 'ACTIVE' ? ' (desvinculado)' : ''}</td>
          <td><span class="pill-dot ${ACC_BADGE[x.account_status]}">${ACC_LABEL[x.account_status]}</span></td>
          <td>${x.membership_status === 'ACTIVE' ? `<button class="btn-sm ghost" data-unlink="${x.id}">Desvincular</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum usuário ainda. Envie um convite ao lado.</td></tr>'}
        </tbody></table></div></section>
      <section class="box"><span class="box-kicker">Histórico</span><h3>Avaliações</h3>
        ${c.assessments.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><tbody>${c.assessments.map((a) => `<tr><td class="small">${dtShort(a.started_at)}</td><td>${ASS_LABEL[a.status]}</td><td><b>${pct(a.overall_maturity)}</b></td>
          <td>${a.result_status ? `<span class="pill-dot ${STATUS_BADGE[a.result_status]}">${STATUS_LABEL[a.result_status]}</span>` : ''}</td>
          <td style="text-align:right">${a.status === 'FINALIZED' ? `<a class="btn-sm soft" href="/resultado.html?id=${a.id}">Resultado</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Nenhuma avaliação.</p>'}</section>
    </div><div class="stack">
      <section class="box"><span class="box-kicker">Novo acesso</span><h3>Enviar convite</h3><p class="small muted">O acesso é somente por convite. O link vale por tempo limitado e só pode ser usado uma vez.</p>
        <form id="iform" style="margin-top:14px">${field('email', 'E-mail *', 'type="email" required')}${field('name', 'Nome')}
          ${select('role', 'Perfil', [['GESTOR', 'Gestor da Empresa (responde e finaliza)'], ['TI', 'Responsável de TI (somente consulta)']])}
          <div class="alert"></div><button class="btn-sm primary" style="margin-top:6px">Enviar convite</button></form><div id="link"></div></section>
      <section class="box"><span class="box-kicker">Histórico de convites</span><h3>Convites</h3>
        ${c.invitations.length ? c.invitations.map((i) => `<div class="ev-item" style="margin-top:8px"><div><b>${esc(i.email)}</b><div class="small muted">${ROLE_LABEL[i.role]} · ${INV_LABEL[i.status] || i.status} · ${i.status === 'PENDING' ? `expira ${dtt(i.expires_at)}` : dt(i.created_at)}</div></div>
          ${i.status !== 'ACCEPTED' ? `<div class="row"><button class="btn-sm ghost" data-resend="${i.id}">Reenviar</button>${i.status === 'PENDING' ? `<button class="btn-sm danger" data-revoke="${i.id}">Revogar</button>` : ''}</div>` : ''}</div>`).join('') : '<p class="small muted">Nenhum convite enviado.</p>'}</section>
      <section class="box"><span class="box-kicker">Limites</span><h3>Uso de IA no mês</h3><p class="small muted">Relatórios: ${u.reports_this_month} de ${u.reports_limit} · Tokens: ${u.tokens_this_month.toLocaleString('pt-BR')} de ${u.tokens_limit.toLocaleString('pt-BR')} · Custo estimado US$ ${u.estimated_cost_usd.toFixed(2)}</p></section>
    </div></div>`;
  const reload = () => companyDetail(pane, id);
  $('#back').addEventListener('click', () => viewEmpresas());
  $('#edit').addEventListener('click', () => openCompanyForm(c, reload));
  $('#toggle').addEventListener('click', async () => {
    const off = c.status === 'ACTIVE';
    if (off && !(await confirmDialog('Inativar empresa?', 'Os usuários perdem o acesso imediatamente. O histórico de avaliações e relatórios é preservado.', 'Inativar'))) return;
    try { await patch(`/admin/companies/${id}/status`, { status: off ? 'INACTIVE' : 'ACTIVE' }); toast('Situação atualizada.'); reload(); } catch (e) { toast(e.message, true); }
  });
  const showLink = (r) => {
    $('#link').innerHTML = r.activation_link
      ? `<div class="ok-box show" style="margin-top:14px">E-mail não configurado neste ambiente. Repasse o link de ativação:<br><span class="code">${esc(r.activation_link)}</span></div>`
      : `<div class="ok-box show" style="margin-top:14px">Convite enviado por e-mail.</div>`;
  };
  const iform = $('#iform');
  iform.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(iform);
    try { const r = await post('/admin/invitations', { ...formData(iform), company_id: id }); await reload(); showLink(r); } catch (err) { showFormErrors(iform, err); }
  });
  $$('[data-resend]', pane).forEach((b) => b.addEventListener('click', async () => { try { const r = await post(`/admin/invitations/${b.dataset.resend}/resend`); await reload(); showLink(r); } catch (e) { toast(e.message, true); } }));
  $$('[data-revoke]', pane).forEach((b) => b.addEventListener('click', async () => { try { await post(`/admin/invitations/${b.dataset.revoke}/revoke`); toast('Convite revogado.'); reload(); } catch (e) { toast(e.message, true); } }));
  $$('[data-unlink]', pane).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Desvincular usuário?', 'O usuário deixa de acessar os dados desta empresa. O histórico é mantido.', 'Desvincular'))) return;
    try { await patch('/admin/memberships', { user_id: b.dataset.unlink, company_id: id, status: 'INACTIVE' }); toast('Usuário desvinculado.'); reload(); } catch (e) { toast(e.message, true); }
  }));
}

// ---------- Usuários ----------
async function viewUsuarios(p = 1, q = '', role = '') {
  const pane = renderFrame('usuarios', `<button class="btn-cta" id="new-user">${IC.plus} Criar usuário</button>`);
  pane.innerHTML = `<section class="box">
    <div class="box-head">
      <div><span class="box-kicker">Usuários cadastrados</span><h2>Acessos à plataforma</h2></div>
      <span class="box-count" id="u-count">—</span>
    </div>
    <div class="row" style="margin-bottom:18px">
      <input id="q" class="search-input" placeholder="Buscar por nome ou e-mail" value="${esc(q)}" style="max-width:360px">
      <select id="role-filter" class="search-select">
        <option value="">Todos os perfis</option>
        <option value="ADMIN" ${role === 'ADMIN' ? 'selected' : ''}>Administrador (ADM)</option>
        <option value="GESTOR" ${role === 'GESTOR' ? 'selected' : ''}>Gestor da Empresa</option>
        <option value="TI" ${role === 'TI' ? 'selected' : ''}>Responsável de TI</option>
      </select>
    </div>
    <div id="tbl-area"><p class="muted">Carregando...</p></div>
  </section>`;

  let curPage = p;
  let lastUsers = [];

  async function openUserModal(u = null) {
    let activeCos = [];
    try {
      const cos = await get('/admin/companies?pageSize=100');
      activeCos = cos.items.filter((c) => c.status === 'ACTIVE');
    } catch (e) {
      return toast(e.message, true);
    }
    const isEdit = !!u;
    const initRole = u ? (u.is_platform_admin ? 'ADMIN' : (u.role || 'GESTOR')) : 'GESTOR';
    const initCompany = u?.company_id || '';
    const m = modal(`<h3>${isEdit ? 'Editar usuário' : 'Novo usuário'}</h3><p class="small muted">${isEdit ? 'Atualize nome, e-mail, perfil de acesso ou empresa vinculada.' : 'Cria uma conta de acesso (empresário/gestor, TI ou administrador) e gera o link para definição da senha.'}</p>
      <form id="uf" style="margin-top:14px">${field('name', 'Nome *', `value="${esc(u?.name || '')}" required`)}${field('email', 'E-mail *', `type="email" value="${esc(u?.email || '')}" required`)}
      ${select('role', 'Perfil *', [['GESTOR', 'Gestor da Empresa (Empresário)'], ['TI', 'Responsável de TI (somente leitura)'], ['ADMIN', 'Administrador da plataforma']], initRole)}
      <div id="company-wrap">${select('company_id', 'Empresa *', [['', 'Selecione a empresa'], ...activeCos.map((c) => [c.id, c.trade_name || c.legal_name])], initCompany)}${!activeCos.length ? '<div class="hint" style="color:var(--bad);margin-top:-8px;margin-bottom:10px">Nenhuma empresa ativa cadastrada. Cadastre uma empresa antes ou escolha Administrador.</div>' : ''}</div>
      <div class="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">${isEdit ? 'Salvar alterações' : 'Criar usuário'}</button></div></form>`);
    const f = $('#uf', m.el);
    const roleSel = f.elements.role;
    const compWrap = $('#company-wrap', m.el);
    const compSel = f.elements.company_id;
    const syncRole = () => {
      const isAdmin = roleSel.value === 'ADMIN';
      compWrap.style.display = isAdmin ? 'none' : '';
      compSel.required = !isAdmin;
      if (isAdmin) compSel.value = '';
    };
    roleSel.addEventListener('change', syncRole);
    syncRole();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); clearFormErrors(f);
      const payload = formData(f);
      if (payload.role === 'ADMIN') delete payload.company_id;
      try {
        if (isEdit) {
          await patch(`/admin/users/${u.id}`, payload);
          m.close();
          toast('Usuário atualizado.');
          loadUsers(curPage);
        } else {
          const r = await post('/admin/users', payload);
          m.close();
          loadUsers(1);
          if (r.setup_link) {
            modal(`<h3>Usuário criado (${esc(ROLE_LABEL[r.role] || r.role)})</h3><p class="small muted">E-mail não configurado neste ambiente. Repasse o link de definição de senha:</p><p style="margin-top:12px"><span class="code">${esc(r.setup_link)}</span></p><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn-sm primary" data-close>Fechar</button></div>`);
          } else {
            toast('Usuário criado e link enviado por e-mail.');
          }
        }
      } catch (err) { showFormErrors(f, err); }
    });
  }

  async function loadUsers(page = 1) {
    curPage = page;
    q = $('#q', pane).value;
    role = $('#role-filter', pane).value;
    const qs = `page=${page}&q=${encodeURIComponent(q)}${role ? `&role=${encodeURIComponent(role)}` : ''}`;
    const data = await get(`/admin/users?${qs}`);
    lastUsers = data.items;
    $('#u-count', pane).textContent = `${data.total} usuário(s)`;
    const area = $('#tbl-area', pane);
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome do usuário</th><th>E-mail / Empresa</th><th>Data de criação</th><th>Tipo de acesso</th><th>MFA</th><th>Conta</th><th style="text-align:right">Ações</th></tr></thead><tbody>
      ${data.items.map((u) => {
        const badgeCls = u.is_platform_admin ? 'navy' : 'blue';
        const roleTxt = u.is_platform_admin ? 'Administrador (ADM)' : (u.role ? ROLE_LABEL[u.role] : '—');
        return `<tr>
          <td><div class="entity-cell"><div class="avatar-sq">${esc(initials(u.name))}</div><b>${esc(u.name)}</b></div></td>
          <td class="small"><div>${esc(u.email)}</div><div class="muted">${esc(u.company_name || 'PrismaTI (Plataforma)')}</div></td>
          <td class="small muted">${dtShort(u.created_at)}</td>
          <td><span class="pill-dot ${badgeCls}">${esc(roleTxt)}</span></td>
          <td class="small muted">${u.mfa_enabled ? 'Ativa' : '—'}</td>
          <td><span class="pill-dot ${ACC_BADGE[u.account_status]}">${ACC_LABEL[u.account_status]}</span></td>
          <td><div class="row" style="justify-content:flex-end">
            <button class="icon-btn" data-edit-u="${u.id}" title="Editar usuário">${IC.edit}</button>
            ${u.account_status === 'ACTIVE' ? `<button class="icon-btn" data-reset="${u.id}" data-email="${esc(u.email)}" title="Redefinir senha">${IC.key}</button>` : ''}
            ${u.id === me.id || u.account_status === 'PENDING' ? '' : `<button class="icon-btn ${u.account_status === 'ACTIVE' ? 'danger' : ''}" data-st="${u.id}" data-to="${u.account_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}" title="${u.account_status === 'ACTIVE' ? 'Inativar usuário' : 'Reativar usuário'}">${IC.power}</button>`}
          </div></td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">Nenhum usuário encontrado.</td></tr>'}
      </tbody></table></div>`;
    area.appendChild(pager(data, loadUsers));
    $$('[data-edit-u]', area).forEach((b) => b.addEventListener('click', () => {
      const user = lastUsers.find((x) => x.id === b.dataset.editU);
      if (user) openUserModal(user);
    }));
    $$('[data-st]', area).forEach((b) => b.addEventListener('click', async () => {
      try { await patch(`/admin/users/${b.dataset.st}/status`, { status: b.dataset.to }); toast('Conta atualizada.'); loadUsers(curPage); } catch (e) { toast(e.message, true); }
    }));
    $$('[data-reset]', area).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog('Gerar link de redefinição?', `Um novo link de uso único será gerado para ${b.dataset.email}.`, 'Gerar link'))) return;
      try {
        const r = await post(`/admin/users/${b.dataset.reset}/reset-password`);
        if (r.reset_link) {
          modal(`<h3>Link de redefinição de senha</h3><p class="small muted">Envie o link abaixo para <b>${esc(b.dataset.email)}</b> definir uma nova senha:</p><p style="margin-top:12px"><span class="code">${esc(r.reset_link)}</span></p><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn-sm primary" data-close>Fechar</button></div>`);
        } else {
          toast('E-mail de redefinição enviado.');
        }
      } catch (e) { toast(e.message, true); }
    }));
  }

  $('#q', pane).addEventListener('input', debounce(() => loadUsers(1)));
  $('#role-filter', pane).addEventListener('change', () => loadUsers(1));
  $('#new-user').addEventListener('click', () => openUserModal(null));
  await loadUsers(p);
}

// ---------- Questionário ----------
async function viewQuestionario() {
  const { items } = await get('/admin/instrument-versions');
  const firstId = items[0]?.id;
  const pane = renderFrame('questionario', firstId ? `<button class="btn-cta" id="top-clone">${IC.plus} Criar questionário</button>` : '');
  const V_LABEL = { PUBLISHED: ['blue', 'Versão em uso'], DRAFT: ['amber', 'Rascunho'], RETIRED: ['muted', 'Arquivada'] };

  pane.innerHTML = `<section class="box">
    <div class="box-head">
      <div><span class="box-kicker">Histórico de versões</span><h2>Questionários cadastrados</h2></div>
      <span class="box-count">${items.length} versão(ões)</span>
    </div>
    <p class="small muted" style="margin-bottom:16px">Versões publicadas ou já usadas não podem ser alteradas. Para mudar perguntas, crie um novo rascunho, edite e clique em <b>Usar essa versão</b>.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome do questionário</th><th>Data de criação</th><th>Versão</th><th>Avaliações</th><th style="text-align:right">Ações</th></tr></thead><tbody>
    ${items.map((v) => {
      const activeRow = v.status === 'PUBLISHED';
      const [cls, lbl] = V_LABEL[v.status] || ['muted', v.status];
      return `<tr class="${activeRow ? 'row-hl' : ''}">
        <td><div class="entity-cell"><div class="doc-sq">${IC.doc}</div><b>Diagnóstico de Maturidade de TI — v${esc(v.version)}</b></div></td>
        <td class="small muted">${dtShort(v.created_at)}</td>
        <td><div class="row" style="gap:8px"><b>v${esc(v.version)}</b><span class="pill-dot ${cls}">${lbl}</span></div></td>
        <td class="small muted">${v.assessments_count}</td>
        <td><div class="row" style="justify-content:flex-end">
          <button class="icon-btn" data-view="${v.id}" title="${v.status === 'DRAFT' && !v.assessments_count ? 'Editar perguntas' : 'Visualizar perguntas'}">${v.status === 'DRAFT' && !v.assessments_count ? IC.edit : IC.eye}</button>
          <button class="btn-sm ghost" data-clone="${v.id}">Duplicar</button>
          ${v.status === 'DRAFT' ? `<button class="btn-sm soft" data-pub="${v.id}">Usar essa versão</button>` : (activeRow ? '<span class="btn-sm ghost" style="pointer-events:none;opacity:.75">Em uso</span>' : '')}
        </div></td>
      </tr>`;
    }).join('')}
    </tbody></table></div></section><div id="vdetail"></div>`;

  const openClone = (sourceId) => {
    const m = modal(`<h3>Nova versão do questionário</h3><form id="vf">${field('version', 'Número da versão *', 'placeholder="1.1" required', 'Formato 1.1, 2.0...')}<div class="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Criar rascunho</button></div></form>`);
    const f = $('#vf', m.el);
    f.addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await post(`/admin/instrument-versions/${sourceId}/clone`, formData(f)); m.close(); await viewQuestionario(); versionDetail(r.id); } catch (err) { showFormErrors(f, err); } });
  };

  $('#top-clone')?.addEventListener('click', () => openClone(firstId));
  $$('[data-clone]', pane).forEach((b) => b.addEventListener('click', () => openClone(b.dataset.clone)));
  $$('[data-pub]', pane).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Usar esta versão?', 'Novas avaliações passam a usar esta versão. A versão publicada anterior é arquivada e as avaliações existentes não mudam.', 'Publicar'))) return;
    try { await post(`/admin/instrument-versions/${b.dataset.pub}/publish`); toast('Versão publicada.'); viewQuestionario(); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-view]', pane).forEach((b) => b.addEventListener('click', () => versionDetail(b.dataset.view)));
}

async function versionDetail(vid) {
  const v = await get(`/admin/instrument-versions/${vid}`);
  const editable = v.status === 'DRAFT';
  const box = $('#vdetail');
  const ta = (name, label, val) => `<div class="field"><label>${label}</label><textarea name="${name}" rows="2" ${editable ? '' : 'readonly'}>${esc(val || '')}</textarea></div>`;
  box.innerHTML = `<section class="box" style="margin-top:22px">
    <div class="dim-head"><div><span class="box-kicker">Estrutura do instrumento</span><h2>Versão ${esc(v.version)} · ${v.questions.length} perguntas em ${v.dimensions.length} dimensões</h2>
      <p class="small muted">${editable ? 'Rascunho: você pode criar dimensões, adicionar ou excluir perguntas e editar alternativas e referências.' : 'Somente leitura.'}</p></div>
      ${editable ? '<div class="row"><button class="btn-sm ghost" id="new-dim">Nova dimensão</button><button class="btn-sm primary" id="new-q">Nova pergunta</button></div>' : ''}</div>
    ${v.dimensions.map((d) => `<div class="row" style="margin-top:24px"><h3 style="margin:0">${esc(d.code)} · ${esc(d.name)}</h3>${editable ? `<button class="btn-sm ghost" data-dim="${d.id}">Editar dimensão</button>` : ''}</div>
      ${v.questions.filter((q) => q.dimension_id === d.id).map((q) => `<details class="qedit"><summary><span class="code">${esc(q.code)}</span> ${esc(q.title)}</summary>
        <form data-q="${q.id}" style="margin-top:14px">
          ${field('theme', 'Tema', `value="${esc(q.theme || '')}" ${editable ? '' : 'readonly'}`)}
          ${ta('title', 'Pergunta', q.title)}${ta('explanation', 'O que verifica', q.explanation)}${ta('evidence_guidance', 'Evidências sugeridas', q.evidence_guidance)}
          ${ta('verification_guidance', 'Como confirmar a resposta', q.verification_guidance)}${ta('no_file_guidance', 'Sem arquivo? Informe...', q.no_file_guidance)}
          ${ta('privacy_guidance', 'Cuidados com a privacidade', q.privacy_guidance)}${ta('applicability_note', 'Nota de aplicabilidade', q.applicability_note)}
          ${q.options.map((o) => ta(`opt${o.score}`, `Alternativa ${o.score}`, o.description)).join('')}
          ${ta('first_recommendation', 'Primeira recomendação', q.first_recommendation)}
          ${field('references_text', 'Referências metodológicas (separadas por ;)', `value="${esc(q.references.map((r) => r.reference_code).join('; '))}" ${editable ? '' : 'readonly'}`)}
          <div class="alert"></div>${editable ? `<div class="row" style="margin-top:10px"><button class="btn-sm primary">Salvar pergunta</button><button type="button" class="btn-sm danger" data-del-q="${q.id}" data-code="${esc(q.code)}">Excluir pergunta</button></div>` : ''}</form></details>`).join('')}`).join('')}
  </section>`;
  if (!editable) return box.scrollIntoView({ behavior: 'smooth' });
  $('#new-dim', box).addEventListener('click', () => {
    const m = modal(`<h3>Nova dimensão</h3><form id="ndf">${field('code', 'Código *', 'placeholder="SEG" maxlength="10" required')}${field('name', 'Nome *', 'required')}
      <div class="field"><label>Descrição</label><textarea name="description" rows="2"></textarea></div><div class="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Criar dimensão</button></div></form>`);
    const f = $('#ndf', m.el);
    f.addEventListener('submit', async (e) => { e.preventDefault(); clearFormErrors(f); try { await post(`/admin/instrument-versions/${vid}/dimensions`, formData(f)); m.close(); toast('Dimensão criada.'); versionDetail(vid); } catch (err) { showFormErrors(f, err); } });
  });
  $('#new-q', box).addEventListener('click', () => {
    const m = modal(`<h3>Nova pergunta</h3><form id="nqf">${select('dimension_id', 'Dimensão *', v.dimensions.map((d) => [d.id, `${d.code} · ${d.name}`]))}
      <div class="grid2" style="gap:12px">${field('code', 'Código *', 'placeholder="P31" maxlength="12" required')}${field('theme', 'Tema')}</div>
      <div class="field"><label>Pergunta *</label><textarea name="title" rows="2" required></textarea></div>
      <div class="field"><label>O que verifica</label><textarea name="explanation" rows="2"></textarea></div>
      ${[0, 1, 2, 3, 4].map((s) => `<div class="field"><label>Alternativa ${s} *</label><textarea name="opt${s}" rows="2" required></textarea></div>`).join('')}
      <div class="field"><label>Evidências sugeridas</label><textarea name="evidence_guidance" rows="2"></textarea></div>
      <div class="field"><label>Como confirmar</label><textarea name="verification_guidance" rows="2"></textarea></div>
      <div class="field"><label>Sem arquivo? Informe...</label><textarea name="no_file_guidance" rows="2"></textarea></div>
      <div class="field"><label>Cuidados com a privacidade</label><textarea name="privacy_guidance" rows="2"></textarea></div>
      <div class="field"><label>Nota de aplicabilidade</label><textarea name="applicability_note" rows="2"></textarea></div>
      <div class="field"><label>Primeira recomendação</label><textarea name="first_recommendation" rows="2"></textarea></div>
      ${field('references_text', 'Referências (separadas por ;)', 'placeholder="COBIT 2019 APO01; ISO 27001 §5.3"')}
      <div class="alert"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Adicionar pergunta</button></div></form>`);
    const f = $('#nqf', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); clearFormErrors(f);
      const d = formData(f);
      const body = { dimension_id: d.dimension_id, code: d.code, theme: d.theme, title: d.title, explanation: d.explanation, evidence_guidance: d.evidence_guidance,
        verification_guidance: d.verification_guidance, no_file_guidance: d.no_file_guidance, privacy_guidance: d.privacy_guidance, applicability_note: d.applicability_note,
        first_recommendation: d.first_recommendation, references_text: d.references_text, options: [0, 1, 2, 3, 4].map((s) => ({ score: s, description: d[`opt${s}`] })) };
      try { await post(`/admin/instrument-versions/${vid}/questions`, body); m.close(); toast('Pergunta adicionada.'); versionDetail(vid); } catch (err) { showFormErrors(f, err); }
    });
  });
  $$('[data-dim]', box).forEach((b) => b.addEventListener('click', () => {
    const d = v.dimensions.find((x) => x.id === b.dataset.dim);
    const m = modal(`<h3>Editar dimensão ${esc(d.code)}</h3><form id="df">${field('name', 'Nome *', `value="${esc(d.name)}" required`)}<div class="field"><label>Descrição</label><textarea name="description" rows="3">${esc(d.description || '')}</textarea></div><div class="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Salvar</button></div></form>`);
    const f = $('#df', m.el);
    f.addEventListener('submit', async (e) => { e.preventDefault(); clearFormErrors(f); try { await patch(`/admin/instrument-versions/${vid}/dimensions/${d.id}`, formData(f)); m.close(); toast('Dimensão salva.'); versionDetail(vid); } catch (err) { showFormErrors(f, err); } });
  }));
  $$('form[data-q]', box).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(f);
    const d = formData(f);
    const body = { theme: d.theme, title: d.title, explanation: d.explanation, evidence_guidance: d.evidence_guidance, verification_guidance: d.verification_guidance,
      no_file_guidance: d.no_file_guidance, privacy_guidance: d.privacy_guidance, applicability_note: d.applicability_note, first_recommendation: d.first_recommendation,
      references_text: d.references_text, options: [0, 1, 2, 3, 4].map((s) => ({ score: s, description: d[`opt${s}`] })) };
    try { await patch(`/admin/instrument-versions/${vid}/questions/${f.dataset.q}`, body); toast('Pergunta salva.'); } catch (err) { showFormErrors(f, err); }
  }));
  $$('[data-del-q]', box).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog(`Excluir pergunta ${b.dataset.code}?`, 'A pergunta será removida deste rascunho.', 'Excluir'))) return;
    try { await del(`/admin/instrument-versions/${vid}/questions/${b.dataset.delQ}`); toast('Pergunta excluída.'); versionDetail(vid); } catch (err) { toast(err.message, true); }
  }));
  box.scrollIntoView({ behavior: 'smooth' });
}

// ---------- Avaliações / Relatórios ----------
async function viewAvaliacoes(p = 1) {
  const pane = renderFrame('avaliacoes');
  const data = await get(`/admin/assessments?page=${p}`);
  pane.innerHTML = `<section class="box">
    <div class="box-head"><div><span class="box-kicker">Diagnósticos</span><h2>Todas as avaliações</h2></div><span class="box-count">${data.total} avaliação(ões)</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Início</th><th>Situação</th><th>Respondidas</th><th>Maturidade</th><th>Relatórios</th><th style="text-align:right">Ações</th></tr></thead><tbody>
    ${data.items.map((a) => `<tr><td><b>${esc(a.company_name)}</b><div class="small muted">Instrumento v${esc(a.version)}</div></td><td class="small muted">${dtShort(a.started_at)}</td><td><span class="pill-dot ${a.status === 'FINALIZED' ? 'green' : 'blue'}">${ASS_LABEL[a.status]}</span></td><td>${a.answered}</td>
      <td>${pct(a.overall_maturity)}${a.result_status ? ` <span class="pill-dot ${STATUS_BADGE[a.result_status]}" style="margin-left:6px">${STATUS_LABEL[a.result_status]}</span>` : ''}</td><td>${a.reports}</td>
      <td style="text-align:right">${a.status === 'FINALIZED' ? `<a class="btn-sm soft" href="/resultado.html?id=${a.id}">Resultado</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma avaliação.</td></tr>'}
    </tbody></table></div></section>`;
  $('.box', pane).appendChild(pager(data, (np) => viewAvaliacoes(np)));
}

async function viewRelatorios(p = 1) {
  const pane = renderFrame('relatorios');
  const [jobs, usage] = await Promise.all([get(`/admin/report-jobs?page=${p}`), get('/admin/ai-usage?pageSize=10')]);
  const m = usage.month;
  pane.innerHTML = `<div class="kpi-grid">
      <article class="kpi-card"><div class="kpi-body"><small>Provedor de IA</small><div class="kpi-num" style="font-size:24px">${usage.provider === 'anthropic' ? 'Anthropic' : 'Gerador local'}</div><div class="kpi-sub">${esc(usage.model)}</div></div></article>
      <article class="kpi-card featured"><div class="kpi-body"><small>Tokens no mês</small><div class="kpi-num">${(m.input_tokens + m.output_tokens).toLocaleString('pt-BR')}</div><div class="kpi-sub">${m.calls} chamada(s) · limite ${usage.limits.tokens_global.toLocaleString('pt-BR')}</div></div></article>
      <article class="kpi-card"><div class="kpi-body"><small>Custo estimado no mês</small><div class="kpi-num">US$ ${m.cost.toFixed(2)}</div><div class="kpi-sub">Limite por empresa: ${usage.limits.reports_per_company} relatórios</div></div></article>
    </div>
    <section class="box"><div class="box-head"><div><span class="box-kicker">Documentos</span><h2>Solicitações de relatório</h2></div><span class="box-count">${jobs.total} registro(s)</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Solicitado</th><th>Situação</th><th>Tentativas</th><th>Erro</th><th style="text-align:right">PDF</th></tr></thead><tbody>
    ${jobs.items.map((j) => `<tr><td><b>${esc(j.company_name)}</b></td><td class="small muted">${dtt(j.requested_at)}</td><td><span class="pill-dot ${JOB_BADGE[j.status]}">${JOB_LABEL[j.status]}</span></td><td>${j.attempt_count}</td><td class="small muted">${esc(j.error_code || '—')}</td>
      <td>${j.report_id ? `<div class="row" style="justify-content:flex-end"><a class="btn-sm ghost" href="/api/v1/reports/${j.report_id}/pdf?inline=1" target="_blank" rel="noopener">Abrir PDF (v${j.report_version})</a><a class="btn-sm soft" href="/api/v1/reports/${j.report_id}/pdf">Baixar</a></div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma solicitação.</td></tr>'}
    </tbody></table></div></section>
    <section class="box" style="margin-top:20px"><div class="box-head"><div><span class="box-kicker">Histórico técnico</span><h2>Consumo recente</h2></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Empresa</th><th>Modelo</th><th>Entrada</th><th>Saída</th><th>Custo</th><th>Situação</th></tr></thead><tbody>
    ${usage.items.map((u) => `<tr><td class="small muted">${dtt(u.created_at)}</td><td>${esc(u.company_name)}</td><td class="small">${esc(u.model)}</td><td>${u.input_tokens}</td><td>${u.output_tokens}</td><td>US$ ${u.estimated_cost.toFixed(4)}</td><td class="small">${esc(u.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sem consumo registrado.</td></tr>'}
    </tbody></table></div></section>`;
  $$('.box', pane)[0].appendChild(pager(jobs, (np) => viewRelatorios(np)));
}

async function viewAuditoria(p = 1, action = '', companyId = '') {
  const pane = renderFrame('auditoria');
  const cos = await get('/admin/companies?pageSize=100');
  pane.innerHTML = `<section class="box">
    <div class="box-head"><div><span class="box-kicker">Segurança e rastreabilidade</span><h2>Logs de auditoria</h2></div></div>
    <div class="row" style="margin-bottom:16px"><input id="act" class="search-input" placeholder="Filtrar por ação (ex.: auth, assessment, report)" value="${esc(action)}" style="max-width:340px">
    <select id="comp" class="search-select"><option value="">Todas as empresas</option>${cos.items.map((c) => `<option value="${esc(c.id)}" ${c.id === companyId ? 'selected' : ''}>${esc(c.trade_name || c.legal_name)}</option>`).join('')}</select></div>
    <div id="tbl-area"><p class="muted">Carregando...</p></div></section>`;
  async function loadLogs(page = 1) {
    action = $('#act', pane).value.trim();
    companyId = $('#comp', pane).value;
    const qs = `page=${page}&action=${encodeURIComponent(action)}${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ''}`;
    const data = await get(`/admin/audit-logs?${qs}`);
    const area = $('#tbl-area', pane);
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Entidade</th><th>Detalhes</th><th>IP</th></tr></thead><tbody>
      ${data.items.map((l) => `<tr><td class="small muted">${dtt(l.created_at)}</td><td><span class="code">${esc(l.action)}</span></td><td class="small">${esc(l.actor_email || '—')}</td>
        <td class="small muted">${esc(l.entity_type || '')}</td><td class="small muted" style="max-width:280px">${esc(l.metadata || '')}</td><td class="small muted">${esc(l.ip || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum registro.</td></tr>'}
      </tbody></table></div>`;
    area.appendChild(pager(data, loadLogs));
  }
  $('#act', pane).addEventListener('input', debounce(() => loadLogs(1)));
  $('#comp', pane).addEventListener('change', () => loadLogs(1));
  await loadLogs(p);
}

// ---------- Conta / MFA ----------
async function viewConta() {
  const pane = renderFrame('conta');
  const cur = await get('/auth/me');
  pane.innerHTML = `<section class="profile-card" style="max-width:680px">
    <div class="profile-head">
      <div class="profile-avatar">${esc(initials(cur.name))}</div>
      <div><h2 style="font-size:22px">${esc(cur.name)}</h2><p class="small muted">${esc(cur.email)} · Administrador da plataforma</p></div>
    </div>
    <div style="margin-top:22px">
      <span class="box-kicker">Autenticação</span>
      <h3>Verificação em duas etapas (MFA)</h3>
      ${cur.mfa_setup_required ? '<div class="alert show">Ative a verificação em duas etapas para usar a administração.</div>' : ''}
      <p class="small muted" style="margin-top:8px">${cur.mfa_enabled ? 'Ativa. Ao entrar, será pedido o código de 6 dígitos do aplicativo autenticador.' : 'Use um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password...) para gerar códigos de acesso.'}</p>
      ${cur.mfa_enabled ? `<form id="mf-off" style="margin-top:16px">${field('code', 'Para desativar, digite o código de 6 dígitos do autenticador', 'inputmode="numeric" maxlength="6" required autocomplete="one-time-code"')}<div class="alert"></div><button class="btn-sm danger">Desativar verificação em duas etapas</button></form>`
        : `<button class="btn-cta" id="setup" style="margin-top:16px">Configurar agora</button><div id="mfa"></div>`}
    </div></section>`;
  $('#mf-off')?.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors($('#mf-off'));
    try { await post('/auth/mfa/disable', formData($('#mf-off'))); toast('Verificação em duas etapas desativada.'); viewConta(); } catch (err) { showFormErrors($('#mf-off'), err); }
  });
  $('#setup')?.addEventListener('click', async () => {
    try {
      const s = await post('/auth/mfa/setup');
      $('#mfa').innerHTML = `<p class="small" style="margin-top:16px">1. Escaneie o QR Code abaixo no aplicativo autenticador ou adicione a chave manual:</p>
        ${s.qr_svg ? `<div style="margin:14px 0;display:inline-block;padding:12px;border:1px solid #dbe5f2;border-radius:14px;background:#fff">${s.qr_svg}</div>` : ''}
        <p><span class="code">${esc(s.secret)}</span></p><p class="small muted" style="word-break:break-all">${esc(s.otpauth_url)}</p>
        <form id="mf" style="margin-top:12px">${field('code', '2. Digite o código de 6 dígitos', 'inputmode="numeric" maxlength="6" required autocomplete="one-time-code"')}<div class="alert"></div><button class="btn-sm primary">Ativar</button></form>`;
      const f = $('#mf');
      f.addEventListener('submit', async (e) => { e.preventDefault(); clearFormErrors(f); try { await post('/auth/mfa/enable', formData(f)); toast('Verificação em duas etapas ativada.'); tab = 'empresas'; load(); } catch (err) { showFormErrors(f, err); } });
    } catch (e) { toast(e.message, true); }
  });
}

const VIEWS = { empresas: () => viewEmpresas(), usuarios: () => viewUsuarios(), questionario: () => viewQuestionario(), avaliacoes: () => viewAvaliacoes(), relatorios: () => viewRelatorios(), auditoria: () => viewAuditoria(), conta: () => viewConta() };
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1) || 'empresas';
  if (VALID_TABS.includes(next) && next !== tab) { tab = next; load(); }
});
load();
