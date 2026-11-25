// Utilitários compartilhados pelas páginas do sistema.
export const API = '/api/v1';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Erro inesperado.');
    this.status = status; this.code = body?.error?.code; this.fields = body?.error?.fields; this.traceId = body?.error?.traceId;
  }
}

export async function api(method, path, body, { form = false, silentAuth = false } = {}) {
  const opts = { method, headers: { 'X-PrismaTI': '1' }, credentials: 'same-origin' };
  if (body !== undefined) {
    if (form) opts.body = body;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  let res;
  try { res = await fetch(API + path, opts); } catch {
    throw new ApiError(0, { error: { message: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.' } });
  }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (!silentAuth && res.status === 401 && !location.pathname.match(/entrar|ativar|esqueci|redefinir/)) {
      location.href = `/entrar.html?voltar=${encodeURIComponent(location.pathname + location.search)}`;
    }
    throw new ApiError(res.status, data);
  }
  return data;
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(d).replace('.', ',')}%`);
export const dt = (s) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—');
export const dtShort = (s) => (s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\s+de\s+/g, ' ') : '—');
export const dtt = (s) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const initials = (s) => {
  const parts = String(s || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PT';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts.at(-1)[0] : parts[0][1] || '')).toUpperCase();
};

let toastEl;
export function toast(msg, isErr = false) {
  toastEl ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toast' });
  toastEl.textContent = msg;
  toastEl.classList.toggle('err', isErr);
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), isErr ? 6000 : 3000);
}

// Mostra erros de validação ao lado dos campos (RNF-051/052)
export function showFormErrors(form, err) {
  $$('.field', form).forEach((f) => { f.classList.remove('has-err'); f.querySelector('small.err')?.remove(); });
  const box = $('.alert', form);
  if (box) { box.textContent = err.message + (err.status >= 500 && err.traceId ? ` (código: ${err.traceId.slice(0, 8)})` : ''); box.classList.add('show'); }
  for (const [name, msg] of Object.entries(err.fields || {})) {
    const input = form.elements[name];
    const field = input?.closest?.('.field');
    if (field) { field.classList.add('has-err'); field.insertAdjacentHTML('beforeend', `<small class="err">${esc(msg)}</small>`); }
  }
}
export function clearFormErrors(form) {
  $$('.field', form).forEach((f) => { f.classList.remove('has-err'); f.querySelector('small.err')?.remove(); });
  $('.alert', form)?.classList.remove('show');
}

export const ROLE_LABEL = { ADMIN: 'Administrador', GESTOR: 'Gestor da Empresa', TI: 'Responsável de TI' };
export const STATUS_LABEL = { APTO_REVISAO: 'Apto à revisão', PRELIMINAR: 'Preliminar', SEM_DADOS: 'Sem dados suficientes' };
export const STATUS_BADGE = { APTO_REVISAO: 'green', PRELIMINAR: 'amber', SEM_DADOS: 'red' };
export const JOB_LABEL = { QUEUED: 'Em fila', PROCESSING: 'Processando', COMPLETED: 'Concluído', FAILED: 'Falha' };
export const JOB_BADGE = { QUEUED: 'blue', PROCESSING: 'blue', COMPLETED: 'green', FAILED: 'red' };
export const LEVEL_COLOR = (p) => (p === null || p === undefined ? '#c3cde0' : p <= 20 ? '#e5484d' : p <= 40 ? '#f08c2e' : p <= 60 ? '#e6a100' : p <= 80 ? '#1f66ff' : '#12a46b');

const SB_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 11h2a2 2 0 0 1 2 2v8M2 21h20M8 7h2M12 7h2M8 11h2M12 11h2M8 15h2M12 15h2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M16 19.5c1.5 0 4 .8 5 2"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  arrowL: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
};

export function setSidebarActive(key) {
  $$('.sb-item[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === key));
}

// Monta a sidebar flutuante do Figma; devolve o usuário atual (ou null se optional=true e sem sessão)
export async function mountHeader(active, { optional = false, collapsed = false, onNavigate = null } = {}) {
  let me;
  try {
    me = await api('GET', '/auth/me', undefined, { silentAuth: optional });
  } catch (err) {
    if (optional) return null;
    throw err;
  }
  const activeKey = active === 'auto' ? (me.is_platform_admin ? 'avaliacoes' : 'painel') : active;
  const home = me.is_platform_admin ? '/admin.html' : '/painel.html';
  const stored = localStorage.getItem('prismati_sb_collapsed');
  const startCollapsed = collapsed || stored === '1';

  const navItems = me.is_platform_admin
    ? [
        { k: 'empresas', href: '/admin.html#empresas', icon: 'building', label: 'Gerenciamento de empresas' },
        { k: 'usuarios', href: '/admin.html#usuarios', icon: 'users', label: 'Usuários' },
        { k: 'questionario', href: '/admin.html#questionario', icon: 'file', label: 'Questionário' },
        { divider: 'Acompanhamento' },
        { k: 'avaliacoes', href: '/admin.html#avaliacoes', icon: 'clipboard', label: 'Avaliações' },
        { k: 'relatorios', href: '/admin.html#relatorios', icon: 'sparkles', label: 'Relatórios de IA' },
        { k: 'auditoria', href: '/admin.html#auditoria', icon: 'activity', label: 'Auditoria' },
        { k: 'conta', href: '/admin.html#conta', icon: 'shield', label: 'Minha conta' },
      ]
    : [
        { k: 'painel', href: '/painel.html', icon: 'dashboard', label: 'Dashboard' },
        { k: 'perfil', href: '/painel.html#perfil', icon: 'user', label: 'Meu perfil' },
      ];

  document.querySelector('header.app-header')?.remove();
  const mainEl = document.querySelector('main');
  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.innerHTML = `
    <aside class="sidebar ${startCollapsed ? 'collapsed' : ''}" id="app-sidebar">
      <div class="sb-top">
        <a class="sb-logo" href="${home}"><img src="/img/logo.svg" width="26" height="26" alt=""><span class="sb-label">Prisma<b>TI</b></span></a>
      </div>
      <button type="button" class="sb-toggle" id="sb-toggle" title="Recolher ou expandir menu" aria-label="Recolher ou expandir menu">${SB_ICONS.arrowL}</button>
      <nav class="sb-nav">
        ${navItems.map((it) => (it.divider
          ? `<div class="sb-divider"><span class="sb-label">${esc(it.divider)}</span></div>`
          : `<a href="${it.href}" data-nav="${it.k}" class="sb-item ${activeKey === it.k ? 'active' : ''}" title="${esc(it.label)}">${SB_ICONS[it.icon]}<span class="sb-label">${esc(it.label)}</span></a>`
        )).join('')}
      </nav>
      <div class="sb-foot">
        <a href="/privacidade.html" class="sb-item ${activeKey === 'privacidade' ? 'active' : ''}" title="Privacidade">${SB_ICONS.shield}<span class="sb-label">Privacidade</span></a>
        <button type="button" class="sb-item sb-logout" id="logout" title="Sair">${SB_ICONS.logout}<span class="sb-label">Sair</span></button>
      </div>
    </aside>
    <div class="sb-backdrop" id="sb-backdrop"></div>
    <div class="app-main">
      <div class="mobile-bar">
        <a class="logo" href="${home}"><img src="/img/logo.svg" width="24" height="24" alt=""> <span>Prisma<b>TI</b></span></a>
        <button type="button" class="icon-btn" id="sb-open" aria-label="Abrir menu">${SB_ICONS.menu}</button>
      </div>
      <div class="app-content"><div class="app-inner" id="app-inner"></div></div>
    </div>`;

  document.body.classList.add('app-bg');
  document.body.prepend(shell);
  if (mainEl) {
    mainEl.classList.remove('container', 'page');
    $('#app-inner', shell).appendChild(mainEl);
  }

  const sb = $('#app-sidebar', shell);
  const backdrop = $('#sb-backdrop', shell);
  const closeMob = () => { sb.classList.remove('open'); backdrop.classList.remove('show'); };

  $('#sb-toggle', shell).addEventListener('click', () => {
    const next = sb.classList.toggle('collapsed');
    localStorage.setItem('prismati_sb_collapsed', next ? '1' : '0');
  });
  $('#sb-open', shell).addEventListener('click', () => { sb.classList.add('open'); backdrop.classList.add('show'); });
  backdrop.addEventListener('click', closeMob);

  if (onNavigate) {
    $$('.sb-item[data-nav]', shell).forEach((el) => el.addEventListener('click', (e) => {
      e.preventDefault();
      setSidebarActive(el.dataset.nav);
      closeMob();
      onNavigate(el.dataset.nav);
    }));
  } else {
    $$('.sb-item', shell).forEach((el) => el.addEventListener('click', closeMob));
  }

  $('#logout', shell).addEventListener('click', async () => { try { await post('/auth/logout'); } finally { location.href = '/entrar.html'; } });
  return me;
}

export function modal(html) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg show';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  return { el: bg.firstElementChild, close };
}

export function confirmDialog(title, text, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    const m = modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row" style="margin-top:22px;justify-content:flex-end"><button class="btn-sm ghost" data-close>Cancelar</button><button class="btn-sm primary" id="ok">${esc(okLabel)}</button></div>`);
    m.el.querySelector('#ok').addEventListener('click', () => { m.close(); resolve(true); });
    m.el.parentElement.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m.el.parentElement) resolve(false); });
  });
}

export function fmtBytes(n) { return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`; }

export function fmtCnpj(s) {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (s || '—');
}
