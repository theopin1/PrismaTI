import { get, post, $, esc, showFormErrors, clearFormErrors, ROLE_LABEL } from './api.js';

const page = document.body.dataset.page;
const form = $('#form');
const token = new URLSearchParams(location.hash.slice(1)).get('token');
// Remove o token da barra de endereço e do histórico
if (token) history.replaceState(null, '', location.pathname);

function busy(on) { const b = $('button[type=submit]', form); b.disabled = on; b.style.opacity = on ? 0.6 : 1; }
function local(errFields) { return Object.assign(new Error('Alguns campos precisam de correção.'), { fields: errFields }); }

if (page === 'entrar') {
  const msg = new URLSearchParams(location.search).get('msg');
  if (msg) { $('#ok').textContent = msg; $('#ok').classList.add('show'); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(form); busy(true);
    try {
      const body = { email: form.email.value, password: form.password.value };
      if (!$('#mfa-field').hidden) body.mfa_code = form.mfa_code.value.trim();
      const r = await post('/auth/login', body);
      if (r.mfa_required) { $('#mfa-field').hidden = false; form.mfa_code.focus(); return; }
      const back = new URLSearchParams(location.search).get('voltar');
      location.href = back && back.startsWith('/') && !back.startsWith('//') ? back : r.redirect;
    } catch (err) { showFormErrors(form, err); } finally { busy(false); }
  });
}

if (page === 'ativar') {
  (async () => {
    try {
      if (!token) throw new Error('Link de convite incompleto. Abra o link exatamente como recebido no e-mail.');
      const inv = await get(`/auth/invitation?token=${encodeURIComponent(token)}`);
      $('#inv-info').innerHTML = `Convite para <b>${esc(inv.email)}</b> como <b>${esc(ROLE_LABEL[inv.role])}</b> da empresa <b>${esc(inv.company)}</b>.`;
      if (inv.name) form.name.value = inv.name;
    } catch (err) {
      $('#inv-info').textContent = err.message;
      $('button[type=submit]', form).disabled = true;
    }
  })();
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(form);
    if (form.password.value !== form.password2.value) return showFormErrors(form, local({ password2: 'As senhas não conferem.' }));
    busy(true);
    try {
      await post('/auth/activate', { token, name: form.name.value, password: form.password.value });
      location.href = '/entrar.html?msg=' + encodeURIComponent('Conta ativada! Entre com seu e-mail e a senha criada.');
    } catch (err) { showFormErrors(form, err); } finally { busy(false); }
  });
}

if (page === 'esqueci') {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(form); busy(true);
    try {
      const r = await post('/auth/password/forgot', { email: form.email.value });
      $('#ok').textContent = r.message; $('#ok').classList.add('show');
    } catch (err) { showFormErrors(form, err); } finally { busy(false); }
  });
}

if (page === 'redefinir') {
  if (!token) { $('.alert', form).textContent = 'Link incompleto. Solicite uma nova redefinição.'; $('.alert', form).classList.add('show'); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearFormErrors(form);
    if (form.password.value !== form.password2.value) return showFormErrors(form, local({ password2: 'As senhas não conferem.' }));
    busy(true);
    try {
      await post('/auth/password/reset', { token, password: form.password.value });
      location.href = '/entrar.html?msg=' + encodeURIComponent('Senha alterada. Entre com a nova senha.');
    } catch (err) { showFormErrors(form, err); } finally { busy(false); }
  });
}
