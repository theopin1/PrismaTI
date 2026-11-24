import { get, post, patch, $, $$, esc, pct, dt, dtt, mountHeader, toast, modal, confirmDialog, showFormErrors, clearFormErrors, ROLE_LABEL, STATUS_LABEL, STATUS_BADGE, JOB_LABEL, JOB_BADGE } from './api.js';

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
    ${field('cnpj', 'CNPJ', `value="${esc(c.cnpj || '')}" inputmode="numeric"`, 'Opcional. 14 dígitos.')}
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
  const data = await get(`/admin/companies?page=${p}&q=${encodeURIComponent(q)}`);
  pane.innerHTML = `<section class="box"><div class="row"><input id="q" placeholder="Buscar por nome ou CNPJ" value="${esc(q)}" style="max-width:320px"><span class="spacer"></span><button class="btn-sm primary" id="new">Nova empresa</button></div>
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Usuários</th><th>Última avaliação</th><th>Situação</th><th></th></tr></thead><tbody>
    ${data.items.map((c) => `<tr><td><b>${esc(c.trade_name || c.legal_name)}</b><div class="small muted">${esc(c.legal_name)}</div></td><td class="small">${esc(c.cnpj || '—')}</td><td>${c.active_users}</td>
      <td class="small">${c.last_assessment_status ? ASS_LABEL[c.last_assessment_status] : '—'}</td><td><span class="badge ${ACC_BADGE[c.status]}">${ACC_LABEL[c.status]}</span></td>
      <td><button class="btn-sm ghost" data-open="${c.id}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma empresa cadastrada.</td></tr>'}
    </tbody></table></div></section>`;
  $('.box', pane).appendChild(pager(data, (np) => viewEmpresas(pane, np, q)));
  $('#q').addEventListener('change', (e) => viewEmpresas(pane, 1, e.target.value));
  $('#new').addEventListener('click', () => openCompanyForm(null, (c) => companyDetail(pane, c.id)));
  $$('[data-open]', pane).forEach((b) => b.addEventListener('click', () => companyDetail(pane, b.dataset.open)));
}

async function companyDetail(pane, id) {
  const c = await get(`/admin/companies/${id}`);
  const u = c.ai_usage;
  pane.innerHTML = `<p><button class="btn-sm ghost" id="back">← Empresas</button></p>
    <div class="grid2" style="margin-top:16px"><div class="stack">
      <section class="box"><div class="dim-head"><div><h2>${esc(c.trade_name || c.legal_name)}</h2><p class="small muted">${esc(c.legal_name)}${c.cnpj ? ` · CNPJ ${esc(c.cnpj)}` : ''}</p></div>
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
  const data = await get(`/admin/users?page=${p}&q=${encodeURIComponent(q)}`);
  pane.innerHTML = `<section class="box"><input id="q" placeholder="Buscar por nome ou e-mail" value="${esc(q)}" style="max-width:320px">
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Usuário</th><th>Empresa</th><th>Perfil</th><th>MFA</th><th>Conta</th><th></th></tr></thead><tbody>
    ${data.items.map((u) => `<tr><td>${esc(u.name)}<div class="small muted">${esc(u.email)}</div></td><td class="small">${esc(u.company_name || '—')}</td>
      <td class="small">${u.is_platform_admin ? 'Administrador' : u.role ? ROLE_LABEL[u.role] : '—'}</td><td class="small">${u.mfa_enabled ? 'Ativa' : '—'}</td>
      <td><span class="badge ${ACC_BADGE[u.account_status]}">${ACC_LABEL[u.account_status]}</span></td>
      <td>${u.id === me.id || u.account_status === 'PENDING' ? '' : `<button class="btn-sm ${u.account_status === 'ACTIVE' ? 'danger' : 'ghost'}" data-st="${u.id}" data-to="${u.account_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}">${u.account_status === 'ACTIVE' ? 'Inativar' : 'Reativar'}</button>`}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  $('.box', pane).appendChild(pager(data, (np) => viewUsuarios(pane, np, q)));
  $('#q').addEventListener('change', (e) => viewUsuarios(pane, 1, e.target.value));
  $$('[data-st]', pane).forEach((b) => b.addEventListener('click', async () => {
    try { await patch(`/admin/users/${b.dataset.st}/status`, { status: b.dataset.to }); toast('Conta atualizada.'); viewUsuarios(pane, p, q); } catch (e) { toast(e.message, true); }
  }));
}

// ---------- Questionário ----------
async function viewQuestionario(pane) {
  const { items } = await get('/admin/instrument-versions');
  const V_LABEL = { PUBLISHED: ['green', 'Publicada'], DRAFT: ['amber', 'Rascunho'], RETIRED: ['', 'Arquivada'] };
  pane.innerHTML = `<section class="box"><h2>Versões do questionário</h2><p class="small muted">Versões publicadas ou já usadas não podem ser alteradas. Para mudar perguntas, crie uma nova versão a partir de uma existente, edite e publique. Avaliações antigas continuam ligadas à versão em que foram respondidas.</p>
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Versão</th><th>Situação</th><th>Criada em</th><th>Avaliações</th><th></th></tr></thead><tbody>
    ${items.map((v) => `<tr><td><b>v${esc(v.version)}</b></td><td><span class="badge ${V_LABEL[v.status]?.[0] || ''}">${V_LABEL[v.status]?.[1] || v.status}</span></td><td class="small">${dt(v.created_at)}</td><td>${v.assessments_count}</td>
      <td class="row"><button class="btn-sm ghost" data-view="${v.id}">${v.status === 'DRAFT' && !v.assessments_count ? 'Editar' : 'Ver'}</button><button class="btn-sm ghost" data-clone="${v.id}">Nova versão a partir desta</button>
      ${v.status === 'DRAFT' ? `<button class="btn-sm primary" data-pub="${v.id}">Publicar</button>` : ''}</td></tr>`).join('')}
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
  box.innerHTML = `<section class="box" style="margin-top:22px"><h2>Versão ${esc(v.version)} · ${v.questions.length} perguntas em ${v.dimensions.length} dimensões</h2>
    <p class="small muted">${editable ? 'Rascunho: as alterações são salvas por pergunta.' : 'Somente leitura.'}</p>
    ${v.dimensions.map((d) => `<div class="row" style="margin-top:24px"><h3 style="margin:0">${esc(d.code)} · ${esc(d.name)}</h3>${editable ? `<button class="btn-sm ghost" data-dim="${d.id}">Editar dimensão</button>` : ''}</div>
      ${v.questions.filter((q) => q.dimension_id === d.id).map((q) => `<details class="qedit"><summary><span class="code">${esc(q.code)}</span> ${esc(q.title)}</summary>
        <form data-q="${q.id}" style="margin-top:14px">
          ${field('theme', 'Tema', `value="${esc(q.theme || '')}" ${editable ? '' : 'readonly'}`)}
          ${ta('title', 'Pergunta', q.title)}${ta('explanation', 'O que verifica', q.explanation)}${ta('evidence_guidance', 'Evidências sugeridas', q.evidence_guidance)}
          ${q.options.map((o) => ta(`opt${o.score}`, `Alternativa ${o.score}`, o.description)).join('')}
          ${ta('first_recommendation', 'Primeira recomendação', q.first_recommendation)}
          <p class="small muted">Referências: ${q.references.map((r) => esc(`${r.framework_name} ${r.reference_code}`)).join('; ') || '—'}</p>
          <div class="alert"></div>${editable ? '<button class="btn-sm primary" style="margin-top:10px">Salvar pergunta</button>' : ''}</form></details>`).join('')}`).join('')}
  </section>`;
  if (!editable) return box.scrollIntoView({ behavior: 'smooth' });
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
    const body = { theme: d.theme, title: d.title, explanation: d.explanation, evidence_guidance: d.evidence_guidance, first_recommendation: d.first_recommendation,
      options: [0, 1, 2, 3, 4].map((s) => ({ score: s, description: d[`opt${s}`] })) };
    try { await patch(`/admin/instrument-versions/${vid}/questions/${f.dataset.q}`, body); toast('Pergunta salva.'); } catch (err) { showFormErrors(f, err); }
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
    <section class="box" style="margin-top:20px"><h3>Solicitações de relatório</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Solicitado</th><th>Situação</th><th>Tentativas</th><th>Erro</th></tr></thead><tbody>
    ${jobs.items.map((j) => `<tr><td>${esc(j.company_name)}</td><td class="small">${dtt(j.requested_at)}</td><td><span class="badge ${JOB_BADGE[j.status]}">${JOB_LABEL[j.status]}</span></td><td>${j.attempt_count}</td><td class="small muted">${esc(j.error_code || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma solicitação.</td></tr>'}
    </tbody></table></div></section>
    <section class="box" style="margin-top:20px"><h3>Consumo recente</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Empresa</th><th>Modelo</th><th>Entrada</th><th>Saída</th><th>Custo</th><th>Situação</th></tr></thead><tbody>
    ${usage.items.map((u) => `<tr><td class="small">${dtt(u.created_at)}</td><td>${esc(u.company_name)}</td><td class="small">${esc(u.model)}</td><td>${u.input_tokens}</td><td>${u.output_tokens}</td><td>US$ ${u.estimated_cost.toFixed(4)}</td><td class="small">${esc(u.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sem consumo registrado.</td></tr>'}
    </tbody></table></div></section>`;
  $$('.box', pane)[3].appendChild(pager(jobs, (np) => viewRelatorios(pane, np)));
}

async function viewAuditoria(pane, p = 1, action = '') {
  const data = await get(`/admin/audit-logs?page=${p}&action=${encodeURIComponent(action)}`);
  pane.innerHTML = `<section class="box"><input id="act" placeholder="Filtrar por ação (ex.: auth, assessment, report)" value="${esc(action)}" style="max-width:360px">
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Entidade</th><th>Detalhes</th><th>IP</th></tr></thead><tbody>
    ${data.items.map((l) => `<tr><td class="small">${dtt(l.created_at)}</td><td><span class="code">${esc(l.action)}</span></td><td class="small">${esc(l.actor_email || '—')}</td>
      <td class="small muted">${esc(l.entity_type || '')}</td><td class="small muted" style="max-width:280px">${esc(l.metadata || '')}</td><td class="small muted">${esc(l.ip || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum registro.</td></tr>'}
    </tbody></table></div></section>`;
  $('.box', pane).appendChild(pager(data, (np) => viewAuditoria(pane, np, action)));
  $('#act').addEventListener('change', (e) => viewAuditoria(pane, 1, e.target.value.trim()));
}

// ---------- Conta / MFA ----------
async function viewConta(pane) {
  const cur = await get('/auth/me');
  pane.innerHTML = `<section class="box" style="max-width:640px"><h2>Verificação em duas etapas</h2>
    ${cur.mfa_setup_required ? '<div class="alert show">Ative a verificação em duas etapas para usar a administração.</div>' : ''}
    <p class="muted" style="margin-top:10px">${cur.mfa_enabled ? 'Ativa. Ao entrar, será pedido o código de 6 dígitos do aplicativo autenticador.' : 'Use um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password...) para gerar códigos de acesso.'}</p>
    ${cur.mfa_enabled ? '' : `<button class="btn-sm primary" id="setup" style="margin-top:16px">Configurar agora</button><div id="mfa"></div>`}</section>`;
  $('#setup')?.addEventListener('click', async () => {
    try {
      const s = await post('/auth/mfa/setup');
      $('#mfa').innerHTML = `<p class="small" style="margin-top:16px">1. No aplicativo, adicione uma conta com a chave abaixo (ou use o endereço otpauth):</p>
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
