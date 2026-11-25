// Utilitários compartilhados pelas páginas do sistema.
export const API = '/api/v1';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Erro inesperado.');
    this.status = status; this.code = body?.error?.code; this.fields = body?.error?.fields; this.traceId = body?.error?.traceId;
  }
}

export async function api(method, path, body, { form = false } = {}) {
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
    if (res.status === 401 && !location.pathname.match(/entrar|ativar|esqueci|redefinir/)) {
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
export const dtt = (s) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

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

const LOGO = '<a class="logo" href="/"><img src="/img/logo.svg" width="24" height="24" alt=""> <span>Prisma<b>TI</b></span></a>';

// Cabeçalho das páginas logadas; devolve o usuário atual
export async function mountHeader(active) {
  const me = await get('/auth/me');
  const links = me.is_platform_admin
    ? [['admin', '/admin.html', 'Administração']]
    : [['painel', '/painel.html', 'Painel']];
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `<div class="container nav">${LOGO}
    <nav class="app-nav">${links.map(([k, h, t]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${t}</a>`).join('')}<a href="/privacidade.html">Privacidade</a></nav>
    <div class="row"><div class="user-chip"><div><b>${esc(me.name)}</b>${esc(ROLE_LABEL[me.role])}${me.company ? ` · ${esc(me.company.name)}` : ''}</div></div>
    <button class="btn-sm ghost" id="logout">Sair</button></div></div>`;
  document.body.prepend(header);
  $('#logout').addEventListener('click', async () => { try { await post('/auth/logout'); } finally { location.href = '/entrar.html'; } });
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
