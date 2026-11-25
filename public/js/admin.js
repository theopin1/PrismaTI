import { get, post, patch, del, $, $$, esc, pct, dt, dtt, mountHeader, toast, modal, confirmDialog, showFormErrors, clearFormErrors, fmtCnpj, ROLE_LABEL, STATUS_LABEL, STATUS_BADGE, JOB_LABEL, JOB_BADGE } from './api.js';

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const me = await mountHeader('admin');
if (!me.is_platform_admin) location.href = '/painel.html';
const main = $('#main');

const TABS = [['empresas', 'Empresas'], ['usuarios', 'Usuários'], ['questionario', 'Questionário'], ['avaliacoes', 'Avaliações'], ['relatorios', 'Relatórios de IA'], ['auditoria', 'Auditoria'], ['conta', 'Minha conta']];
const ACC_BADGE = { ACTIVE: 'green', INACTIVE: 'red', PENDING: 'amber' };
const ACC_LABEL = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', PENDING: 'Pendente' };
const INV_LABEL = { PENDING: 'Pendente', ACCEPTED: 'Aceito', REVOKED: 'Revogado', EXPIRED: 'Expirado' };
const ASS_LABEL = { IN_PROGRESS: 'Em andamento', FINALIZED: 'Finalizada' };
let tab = (location.hash.slice(1) || 'empresas');
if (!TABS.some(([k]) => k === tab)) tab = 'empresas';

function shell() {
  main.innerHTML = `<div class="page-head"><div><span class="eyebrow">Administração da plataforma</span><h1>PrismaTI</h1>
    <p>Cadastre empresas, envie convites, mantenha o questionário e acompanhe avaliações, relatórios e auditoria.</p></div></div>
    <div class="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${t}</button>`).join('')}</div>
    <div id="pane"><p class="muted">Carregando...</p></div>`;
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; history.replaceState(null, '', `#${tab}`); shell(); }));
  load();
}

async function load() {
  const pane = $('#pane');
  try { await VIEWS[tab](pane); } catch (e) {
    if (e.code === 'MFA_SETUP_REQUIRED') { tab = 'conta'; return shell(); }
    pane.innerHTML = `<div class="alert show">${esc(e.message)}</div>`;
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

async function viewEmpresas(pane, p = 1, q = '') {
  pane.innerHTML = `<section class="box"><div class="row"><input id="q" class="search-input" placeholder="Buscar por nome ou CNPJ" value="${esc(q)}" style="max-width:320px"><span class="spacer"></span><button class="btn-sm primary" id="new">Nova empresa</button></div>
    <div id="tbl-area" style="margin-top:16px"><p class="muted">Carregando...</p></div></section>`;
  async function loadList(page = 1) {
    q = $('#q', pane).value;
    const data = await get(`/admin/companies?page=${page}&q=${encodeURIComponent(q)}`);
    const area = $('#tbl-area', pane);
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Usuários</th><th>Última avaliação</th><th>Situação</th><th></th></tr></thead><tbody>
      ${data.items.map((c) => `<tr><td><b>${esc(c.trade_name || c.legal_name)}</b><div class="small muted">${esc(c.legal_name)}</div></td><td class="small">${esc(fmtCnpj(c.cnpj))}</td><td>${c.active_users}</td>
        <td class="small">${c.last_assessment_status ? ASS_LABEL[c.last_assessment_status] : '—'}</td><td><span class="badge ${ACC_BADGE[c.status]}">${ACC_LABEL[c.status]}</span></td>
        <td><button class="btn-sm ghost" data-open="${c.id}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma empresa cadastrada.</td></tr>'}
      </tbody></table></div>`;
    area.appendChild(pager(data, loadList));
    $$('[data-open]', area).forEach((b) => b.addEventListener('click', () => companyDetail(pane, b.dataset.open)));
  }
  $('#q', pane).addEventListener('input', debounce(() => loadList(1)));
  $('#new', pane).addEventListener('click', () => openCompanyForm(null, (c) => companyDetail(pane, c.id)));
  await loadList(p);
}

async function companyDetail(pane, id) {
  const c = await get(`/admin/companies/${id}`);
  const u = c.ai_usage;
  pane.innerHTML = `<p><button class="btn-sm ghost" id="back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Empresas</button></p>
    <div class="grid2" style="margin-top:16px"><div class="stack">
      <section class="box"><div class="dim-head"><div><h2>${esc(c.trade_name || c.legal_name)}</h2><p class="small muted">${esc(c.legal_name)}${c.cnpj ? ` · CNPJ ${esc(fmtCnpj(c.cnpj))}` : ''}</p></div>
        <span class="badge ${ACC_BADGE[c.status]}">${ACC_LABEL[c.status]}</span></div>
        <p class="small muted" style="margin-top:10px">${[c.sector, c.company_size, c.employee_count_range && `${c.employee_count_range} colaboradores`, c.contact_email].filter(Boolean).map(esc).join(' · ') || 'Sem dados complementares.'}</p>
        <div class="row" style="margin-top:16px"><button class="btn-sm ghost" id="edit">Editar dados</button>
          <button class="btn-sm ${c.status === 'ACTIVE' ? 'danger' : 'primary'}" id="toggle">${c.status === 'ACTIVE' ? 'Inativar empresa' : 'Reativar empresa'}</button></div></section>
      <section class="box"><h3>Usuários vinculados</h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Perfil</th><th>Conta</th><th></th></tr></thead><tbody>
        ${c.users.map((x) => `<tr><td>${esc(x.name)}<div class="small muted">${esc(x.email)}</div></td><td class="small">${ROLE_LABEL[x.role]}${x.membership_status !== 'ACTIVE' ? ' (desvinculado)' : ''}</td>
          <td><span class="badge ${ACC_BADGE[x.account_status]}">${ACC_LABEL[x.account_status]}</span></td>
          <td>${x.membership_status === 'ACTIVE' ? `<button class="btn-sm ghost" data-unlink="${x.id}">Desvincular</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum usuário ainda. Envie um convite.</td></tr>'}
        </tbody></table></div></section>
      <section class="box"><h3>Avaliações</h3>
        ${c.assessments.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${c.assessments.map((a) => `<tr><td class="small">${dt(a.started_at)}</td><td>${ASS_LABEL[a.status]}</td><td>${pct(a.overall_maturity)}</td>
          <td>${a.result_status ? `<span class="badge ${STATUS_BADGE[a.result_status]}">${STATUS_LABEL[a.result_status]}</span>` : ''}</td>
          <td>${a.status === 'FINALIZED' ? `<a class="btn-sm ghost" href="/resultado.html?id=${a.id}">Resultado</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Nenhuma avaliação.</p>'}</section>
    </div><div class="stack">
      <section class="box"><h3>Enviar convite</h3><p class="small muted">O acesso é somente por convite. O link vale por tempo limitado e só pode ser usado uma vez.</p>
        <form id="iform" style="margin-top:14px">${field('email', 'E-mail *', 'type="email" required')}${field('name', 'Nome')}
          ${select('role', 'Perfil', [['GESTOR', 'Gestor da Empresa (responde e finaliza)'], ['TI', 'Responsável de TI (somente consulta)']])}
          <div class="alert"></div><button class="btn-sm primary" style="margin-top:6px">Enviar convite</button></form><div id="link"></div></section>
      <section class="box"><h3>Convites</h3>
        ${c.invitations.length ? c.invitations.map((i) => `<div class="ev-item" style="margin-top:8px"><div><b>${esc(i.email)}</b><div class="small muted">${ROLE_LABEL[i.role]} · ${INV_LABEL[i.status] || i.status} · ${i.status === 'PENDING' ? `expira ${dtt(i.expires_at)}` : dt(i.created_at)}</div></div>
          ${i.status !== 'ACCEPTED' ? `<div class="row"><button class="btn-sm ghost" data-resend="${i.id}">Reenviar</button>${i.status === 'PENDING' ? `<button class="btn-sm danger" data-revoke="${i.id}">Revogar</button>` : ''}</div>` : ''}</div>`).join('') : '<p class="small muted">Nenhum convite enviado.</p>'}</section>
      <section class="box"><h3>Uso de IA no mês</h3><p class="small muted">Relatórios: ${u.reports_this_month} de ${u.reports_limit} · Tokens: ${u.tokens_this_month.toLocaleString('pt-BR')} de ${u.tokens_limit.toLocaleString('pt-BR')} · Custo estimado US$ ${u.estimated_cost_usd.toFixed(2)}</p></section>
    </div></div>`;
  const reload = () => companyDetail(pane, id);
  $('#back').addEventListener('click', () => viewEmpresas(pane));
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
async function viewUsuarios(pane, p = 1, q = '') {
  pane.innerHTML = `<section class="box"><div class="row"><input id="q" class="search-input" placeholder="Buscar por nome ou e-mail" value="${esc(q)}" style="max-width:320px"><span class="spacer"></span><button class="btn-sm primary" id="new-user">Novo usuário</button></div>
    <div id="tbl-area" style="margin-top:16px"><p class="muted">Carregando...</p></div></section>`;
  let curPage = p;
  async function loadUsers(page = 1) {
    curPage = page;
    q = $('#q', pane).value;
    const data = await get(`/admin/users?page=${page}&q=${encodeURIComponent(q)}`);
    const area = $('#tbl-area', pane);
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Usuário</th><th>Empresa</th><th>Perfil</th><th>MFA</th><th>Conta</th><th></th></tr></thead><tbody>
      ${data.items.map((u) => `<tr><td>${esc(u.name)}<div class="small muted">${esc(u.email)}</div></td><td class="small">${esc(u.company_name || '—')}</td>
        <td class="small">${u.is_platform_admin ? 'Administrador' : u.role ? ROLE_LABEL[u.role] : '—'}</td><td class="small">${u.mfa_enabled ? 'Ativa' : '—'}</td>
        <td><span class="badge ${ACC_BADGE[u.account_status]}">${ACC_LABEL[u.account_status]}</span></td>
        <td><div class="row">${u.account_status === 'ACTIVE' ? `<button class="btn-sm ghost" data-reset="${u.id}" data-email="${esc(u.email)}">Redefinir senha</button>` : ''}${u.id === me.id || u.account_status === 'PENDING' ? '' : `<button class="btn-sm ${u.account_status === 'ACTIVE' ? 'danger' : 'ghost'}" data-st="${u.id}" data-to="${u.account_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}">${u.account_status === 'ACTIVE' ? 'Inativar' : 'Reativar'}</button>`}</div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum usuário.</td></tr>'}
      </tbody></table></div>`;
    area.appendChild(pager(data, loadUsers));
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
  $('#new-user', pane).addEventListener('click', async () => {
    let activeCos = [];
    try {
      const cos = await get('/admin/companies?pageSize=100');
      activeCos = cos.items.filter((c) => c.status === 'ACTIVE');
    } catch (e) {
      return toast(e.message, true);
    }
    const m = modal(`<h3>Novo usuário</h3><p class="small muted">Cria uma conta de acesso (empresário/gestor, TI ou administrador) e gera o link para definição da senha.</p>
      <form id="uf" style="margin-top:14px">${field('name', 'Nome *', 'required')}${field('email', 'E-mail *', 'type="email" required')}
      ${select('role', 'Perfil *', [['GESTOR', 'Gestor da Empresa (Empresário)'], ['TI', 'Responsável de TI (somente leitura)'], ['ADMIN', 'Administrador da plataforma']], 'GESTOR')}
      <div id="company-wrap">${select('company_id', 'Empresa *', [['', 'Selecione a empresa'], ...activeCos.map((c) => [c.id, c.trade_name || c.legal_name])])}${!activeCos.length ? '<div class="hint" style="color:var(--bad);margin-top:-8px;margin-bottom:10px">Nenhuma empresa ativa cadastrada. Cadastre uma empresa antes ou escolha Administrador.</div>' : ''}</div>
      <div class="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Criar usuário</button></div></form>`);
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
        const r = await post('/admin/users', payload);
        m.close();
        loadUsers(1);
        if (r.setup_link) {
          modal(`<h3>Usuário criado (${esc(ROLE_LABEL[r.role] || r.role)})</h3><p class="small muted">E-mail não configurado neste ambiente. Repasse o link de definição de senha:</p><p style="margin-top:12px"><span class="code">${esc(r.setup_link)}</span></p><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn-sm primary" data-close>Fechar</button></div>`);
        } else {
          toast('Usuário criado e link enviado por e-mail.');
        }
      } catch (err) { showFormErrors(f, err); }
    });
  });
  await loadUsers(p);
}

// ---------- Questionário ----------
async function viewQuestionario(pane) {
  const { items } = await get('/admin/instrument-versions');
  const V_LABEL = { PUBLISHED: ['green', 'Publicada'], DRAFT: ['amber', 'Rascunho'], RETIRED: ['', 'Arquivada'] };
  pane.innerHTML = `<section class="box"><h2>Versões do questionário</h2><p class="small muted">Versões publicadas ou já usadas não podem ser alteradas. Para mudar perguntas, crie uma nova versão a partir de uma existente, edite e publique. Avaliações antigas continuam ligadas à versão em que foram respondidas.</p>
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Versão</th><th>Situação</th><th>Criada em</th><th>Avaliações</th><th></th></tr></thead><tbody>
    ${items.map((v) => `<tr><td><b>v${esc(v.version)}</b></td><td><span class="badge ${V_LABEL[v.status]?.[0] || ''}">${V_LABEL[v.status]?.[1] || v.status}</span></td><td class="small">${dt(v.created_at)}</td><td>${v.assessments_count}</td>
      <td><div class="row"><button class="btn-sm ghost" data-view="${v.id}">${v.status === 'DRAFT' && !v.assessments_count ? 'Editar' : 'Ver'}</button><button class="btn-sm ghost" data-clone="${v.id}">Nova versão a partir desta</button>
      ${v.status === 'DRAFT' ? `<button class="btn-sm primary" data-pub="${v.id}">Publicar</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div></section><div id="vdetail"></div>`;
  $$('[data-clone]', pane).forEach((b) => b.addEventListener('click', () => {
    const m = modal(`<h3>Nova versão</h3><form id="vf">${field('version', 'Número da versão *', 'placeholder="1.1" required', 'Formato 1.1, 2.0...')}<div class="alert"></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary">Criar rascunho</button></div></form>`);
    const f = $('#vf', m.el);
    f.addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await post(`/admin/instrument-versions/${b.dataset.clone}/clone`, formData(f)); m.close(); await viewQuestionario(pane); versionDetail(r.id); } catch (err) { showFormErrors(f, err); } });
  }));
  $$('[data-pub]', pane).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Publicar versão?', 'Novas avaliações passam a usar esta versão. A versão publicada anterior é arquivada e as avaliações existentes não mudam.', 'Publicar'))) return;
    try { await post(`/admin/instrument-versions/${b.dataset.pub}/publish`); toast('Versão publicada.'); viewQuestionario(pane); } catch (e) { toast(e.message, true); }
  }));
  $$('[data-view]', pane).forEach((b) => b.addEventListener('click', () => versionDetail(b.dataset.view)));
}

async function versionDetail(vid) {
  const v = await get(`/admin/instrument-versions/${vid}`);
  const editable = v.status === 'DRAFT';
  const box = $('#vdetail');
  const ta = (name, label, val) => `<div class="field"><label>${label}</label><textarea name="${name}" rows="2" ${editable ? '' : 'readonly'}>${esc(val || '')}</textarea></div>`;
  box.innerHTML = `<section class="box" style="margin-top:22px">
    <div class="dim-head"><div><h2>Versão ${esc(v.version)} · ${v.questions.length} perguntas em ${v.dimensions.length} dimensões</h2>
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
async function viewAvaliacoes(pane, p = 1) {
  const data = await get(`/admin/assessments?page=${p}`);
  pane.innerHTML = `<section class="box"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Início</th><th>Situação</th><th>Respondidas</th><th>Maturidade</th><th>Relatórios</th><th></th></tr></thead><tbody>
    ${data.items.map((a) => `<tr><td><b>${esc(a.company_name)}</b><div class="small muted">Instrumento v${esc(a.version)}</div></td><td class="small">${dt(a.started_at)}</td><td>${ASS_LABEL[a.status]}</td><td>${a.answered}</td>
      <td>${pct(a.overall_maturity)}${a.result_status ? ` <span class="badge ${STATUS_BADGE[a.result_status]}">${STATUS_LABEL[a.result_status]}</span>` : ''}</td><td>${a.reports}</td>
      <td>${a.status === 'FINALIZED' ? `<a class="btn-sm ghost" href="/resultado.html?id=${a.id}">Resultado</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma avaliação.</td></tr>'}
    </tbody></table></div></section>`;
  $('.box', pane).appendChild(pager(data, (np) => viewAvaliacoes(pane, np)));
}

async function viewRelatorios(pane, p = 1) {
  const [jobs, usage] = await Promise.all([get(`/admin/report-jobs?page=${p}`), get('/admin/ai-usage?pageSize=10')]);
  const m = usage.month;
  pane.innerHTML = `<div class="grid3">
      <section class="box"><p class="small muted">Provedor</p><div class="stat" style="font-size:22px">${usage.provider === 'anthropic' ? 'Anthropic' : 'Gerador local'}</div><p class="small muted">${esc(usage.model)}</p></section>
      <section class="box"><p class="small muted">Tokens no mês</p><div class="stat">${(m.input_tokens + m.output_tokens).toLocaleString('pt-BR')}</div><p class="small muted">${m.calls} chamada(s) · limite global ${usage.limits.tokens_global.toLocaleString('pt-BR')}</p></section>
      <section class="box"><p class="small muted">Custo estimado no mês</p><div class="stat">US$ ${m.cost.toFixed(2)}</div><p class="small muted">Limite por empresa: ${usage.limits.reports_per_company} relatórios</p></section></div>
    <section class="box" style="margin-top:20px"><h3>Solicitações de relatório</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Solicitado</th><th>Situação</th><th>Tentativas</th><th>Erro</th><th></th></tr></thead><tbody>
    ${jobs.items.map((j) => `<tr><td>${esc(j.company_name)}</td><td class="small">${dtt(j.requested_at)}</td><td><span class="badge ${JOB_BADGE[j.status]}">${JOB_LABEL[j.status]}</span></td><td>${j.attempt_count}</td><td class="small muted">${esc(j.error_code || '')}</td>
      <td>${j.report_id ? `<div class="row"><a class="btn-sm ghost" href="/api/v1/reports/${j.report_id}/pdf?inline=1" target="_blank" rel="noopener">Abrir PDF (v${j.report_version})</a><a class="btn-sm ghost" href="/api/v1/reports/${j.report_id}/pdf">Baixar</a></div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma solicitação.</td></tr>'}
    </tbody></table></div></section>
    <section class="box" style="margin-top:20px"><h3>Consumo recente</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Empresa</th><th>Modelo</th><th>Entrada</th><th>Saída</th><th>Custo</th><th>Situação</th></tr></thead><tbody>
    ${usage.items.map((u) => `<tr><td class="small">${dtt(u.created_at)}</td><td>${esc(u.company_name)}</td><td class="small">${esc(u.model)}</td><td>${u.input_tokens}</td><td>${u.output_tokens}</td><td>US$ ${u.estimated_cost.toFixed(4)}</td><td class="small">${esc(u.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sem consumo registrado.</td></tr>'}
    </tbody></table></div></section>`;
  $$('.box', pane)[3].appendChild(pager(jobs, (np) => viewRelatorios(pane, np)));
}

async function viewAuditoria(pane, p = 1, action = '', companyId = '') {
  const cos = await get('/admin/companies?pageSize=100');
  pane.innerHTML = `<section class="box"><div class="row"><input id="act" class="search-input" placeholder="Filtrar por ação (ex.: auth, assessment, report)" value="${esc(action)}" style="max-width:340px">
    <select id="comp" class="search-select"><option value="">Todas as empresas</option>${cos.items.map((c) => `<option value="${esc(c.id)}" ${c.id === companyId ? 'selected' : ''}>${esc(c.trade_name || c.legal_name)}</option>`).join('')}</select></div>
    <div id="tbl-area" style="margin-top:16px"><p class="muted">Carregando...</p></div></section>`;
  async function loadLogs(page = 1) {
    action = $('#act', pane).value.trim();
    companyId = $('#comp', pane).value;
    const qs = `page=${page}&action=${encodeURIComponent(action)}${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ''}`;
    const data = await get(`/admin/audit-logs?${qs}`);
    const area = $('#tbl-area', pane);
    area.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Entidade</th><th>Detalhes</th><th>IP</th></tr></thead><tbody>
      ${data.items.map((l) => `<tr><td class="small">${dtt(l.created_at)}</td><td><span class="code">${esc(l.action)}</span></td><td class="small">${esc(l.actor_email || '—')}</td>
        <td class="small muted">${esc(l.entity_type || '')}</td><td class="small muted" style="max-width:280px">${esc(l.metadata || '')}</td><td class="small muted">${esc(l.ip || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum registro.</td></tr>'}
      </tbody></table></div>`;
    area.appendChild(pager(data, loadLogs));
  }
  $('#act', pane).addEventListener('input', debounce(() => loadLogs(1)));
  $('#comp', pane).addEventListener('change', () => loadLogs(1));
  await loadLogs(p);
}

// ---------- Conta / MFA ----------
async function viewConta(pane) {
  const cur = await get('/auth/me');
  pane.innerHTML = `<section class="box" style="max-width:640px"><h2>Verificação em duas etapas</h2>
    ${cur.mfa_setup_required ? '<div class="alert show">Ative a verificação em duas etapas para usar a administração.</div>' : ''}
    <p class="muted" style="margin-top:10px">${cur.mfa_enabled ? 'Ativa. Ao entrar, será pedido o código de 6 dígitos do aplicativo autenticador.' : 'Use um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password...) para gerar códigos de acesso.'}</p>
    ${cur.mfa_enabled ? `<form id="mf-off" style="margin-top:16px">${field('code', 'Para desativar, digite o código de 6 dígitos do autenticador', 'inputmode="numeric" maxlength="6" required autocomplete="one-time-code"')}<div class="alert"></div><button class="btn-sm danger">Desativar verificação em duas etapas</button></form>`
      : `<button class="btn-sm primary" id="setup" style="margin-top:16px">Configurar agora</button><div id="mfa"></div>`}</section>`;
  $('#mf-off')?.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors($('#mf-off'));
    try { await post('/auth/mfa/disable', formData($('#mf-off'))); toast('Verificação em duas etapas desativada.'); viewConta(pane); } catch (err) { showFormErrors($('#mf-off'), err); }
  });
  $('#setup')?.addEventListener('click', async () => {
    try {
      const s = await post('/auth/mfa/setup');
      $('#mfa').innerHTML = `<p class="small" style="margin-top:16px">1. Escaneie o QR Code abaixo no aplicativo autenticador ou adicione a chave manual:</p>
        ${s.qr_svg ? `<div style="margin:14px 0;display:inline-block;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff">${s.qr_svg}</div>` : ''}
        <p><span class="code">${esc(s.secret)}</span></p><p class="small muted" style="word-break:break-all">${esc(s.otpauth_url)}</p>
        <form id="mf" style="margin-top:12px">${field('code', '2. Digite o código de 6 dígitos', 'inputmode="numeric" maxlength="6" required autocomplete="one-time-code"')}<div class="alert"></div><button class="btn-sm primary">Ativar</button></form>`;
      const f = $('#mf');
      f.addEventListener('submit', async (e) => { e.preventDefault(); clearFormErrors(f); try { await post('/auth/mfa/enable', formData(f)); toast('Verificação em duas etapas ativada.'); tab = 'empresas'; shell(); } catch (err) { showFormErrors(f, err); } });
    } catch (e) { toast(e.message, true); }
  });
}

const VIEWS = { empresas: viewEmpresas, usuarios: viewUsuarios, questionario: viewQuestionario, avaliacoes: viewAvaliacoes, relatorios: viewRelatorios, auditoria: viewAuditoria, conta: viewConta };
if (me.mfa_setup_required) tab = 'conta';
shell();
