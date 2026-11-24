import { get, put, post, del, api, $, $$, esc, pct, mountHeader, toast, confirmDialog, fmtBytes } from './api.js';

const me = await mountHeader('painel');
const id = new URLSearchParams(location.search).get('id');
const main = $('#main');

const assessment = await get(`/assessments/${id}`);
if (assessment.status === 'FINALIZED') location.replace(`/resultado.html?id=${id}`);
const inst = await get(`/instrument-versions/${assessment.instrument.id}/questions`);
const canEdit = assessment.can_edit;
const answers = assessment.answers || {};
let dimIndex = Math.max(0, Number(sessionStorage.getItem(`dim-${id}`)) || 0);

const dims = inst.dimensions.map((d) => ({ ...d, questions: inst.questions.filter((q) => q.dimension_id === d.id) }));
const ANSWER_LABEL = { NA: 'Não se aplica', NS: 'Não sei informar' };
const SCALE = ['Inexistente', 'Informal', 'Parcial', 'Estabelecido', 'Monitorado'];

function isAnswered(q) {
  const a = answers[q.id];
  return !!a;
}
function needsFix(q) {
  const a = answers[q.id];
  return a && a.type === 'NA' && !(a.justification || '').trim();
}

function renderShell() {
  main.innerHTML = `
    <div class="diag-wrap">
      <aside class="side">
        <h4>Seu progresso</h4>
        <div class="progress"><i id="pbar"></i></div>
        <div class="pct" id="ptext"></div>
        <ul class="dim-nav" id="dimnav"></ul>
        ${canEdit ? '' : `<p class="small muted" style="margin-top:18px">${me.role === 'TI' ? 'Modo consulta: o Responsável de TI pode ver as respostas e orientar o Gestor, mas não pode alterá-las.' : 'Somente leitura.'}</p>`}
        <p class="small muted" style="margin-top:18px">Instrumento v${esc(assessment.instrument.version)} · ${esc(assessment.company.trade_name || assessment.company.legal_name)}</p>
      </aside>
      <section class="panel" id="panel"></section>
    </div>`;
}

function renderSide() {
  const total = inst.questions.length;
  const done = inst.questions.filter(isAnswered).length;
  $('#pbar').style.width = `${(done / total) * 100}%`;
  $('#ptext').textContent = `${done} de ${total} perguntas respondidas (${pct((done / total) * 100, 0)})`;
  $('#dimnav').innerHTML = dims.map((d, i) => {
    const n = d.questions.filter(isAnswered).length;
    const fix = d.questions.some(needsFix);
    return `<li class="${n === d.questions.length && !fix ? 'done' : ''}"><button data-dim="${i}" class="${i === dimIndex ? 'active' : ''}"><span>${esc(d.name)}</span><span class="cnt">${fix ? '⚠ ' : ''}${n}/${d.questions.length}</span></button></li>`;
  }).join('');
}

function optionBtn(q, o, a) {
  const sel = a?.type === 'SCORE' && a.score === o.score;
  return `<button class="opt ${sel ? 'sel' : ''}" data-q="${q.id}" data-score="${o.score}" ${canEdit ? '' : 'disabled'}><span class="s">${o.score}</span><span>${esc(o.description)}<br><small class="muted">${SCALE[o.score]}</small></span></button>`;
}

function evidenceBlock(q, a) {
  if (!a) return canEdit ? '<p class="small muted" style="margin-top:12px">Responda a pergunta para registrar evidências (opcional).</p>' : '';
  const evs = a.evidences || [];
  const statusTxt = { NAO_INFORMADA: 'Nenhuma evidência', INDICADA: 'Evidência indicada', ENVIADA: 'Arquivo enviado' }[a.evidence_status || 'NAO_INFORMADA'];
  return `<div class="ev" data-q="${q.id}">
    <p class="small" style="margin-top:14px"><b>Evidências</b> <span class="badge">${statusTxt}</span> <span class="muted">· opcional, não altera a nota</span></p>
    <div class="ev-list">${evs.map((e) => `<div class="ev-item"><span>${e.evidence_type === 'FILE' ? `📎 <a href="/api/v1/evidences/${e.id}/download" style="color:var(--blue-2)">${esc(e.original_filename)}</a> <span class="muted">${fmtBytes(e.file_size)}</span>` : e.evidence_type === 'TEXT' ? `📝 ${esc(e.description)}` : `✔ ${esc(e.description)}`}</span>${canEdit ? `<button class="btn-sm danger" data-del-ev="${e.id}">Remover</button>` : ''}</div>`).join('')}</div>
    ${canEdit ? `<div class="ev-forms">
      <div class="row"><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" data-file="${q.id}"><button class="btn-sm ghost" data-up="${q.id}">Enviar arquivo</button><span class="small muted">PDF, PNG ou JPEG até 5 MB</span></div>
      <div class="row"><input type="text" placeholder="Descreva a evidência (ex.: planilha de responsáveis no drive da empresa)" data-text="${q.id}" style="flex:1;min-width:220px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:13px"><button class="btn-sm ghost" data-addtext="${q.id}">Adicionar descrição</button></div>
      <div class="row"><button class="btn-sm ghost" data-declare="${q.id}">Tenho a evidência, mas não posso compartilhar</button></div>
      <p class="small muted">⚠ ${esc(q.privacy_guidance || 'Não envie senhas, códigos de acesso ou dados pessoais.')} Nunca envie senhas, códigos de autenticação ou credenciais.</p>
    </div>` : ''}
  </div>`;
}

function questionHtml(q) {
  const a = answers[q.id];
  const refs = q.references.map((r) => r.reference_code).join(' · ');
  return `<article class="q ${needsFix(q) ? 'missing' : ''}" id="q-${q.id}">
    <div class="q-meta"><span class="tag">${esc(q.code)}</span><span>${esc(q.theme)}</span><span class="spacer"></span><span class="save-state" id="ss-${q.id}"></span></div>
    <h3>${esc(q.title)}</h3>
    <p class="what">${esc(q.explanation)}</p>
    <div class="opts">${q.options.map((o) => optionBtn(q, o, a)).join('')}</div>
    <div class="opts-special" style="margin-top:10px">
      ${['NA', 'NS'].map((t) => `<button class="opt-sm ${a?.type === t ? 'sel' : ''}" data-q="${q.id}" data-type="${t}" ${canEdit ? '' : 'disabled'}>${ANSWER_LABEL[t]}</button>`).join('')}
    </div>
    <div class="na-just ${a?.type === 'NA' ? 'show' : ''} ${needsFix(q) ? 'err' : ''}" id="na-${q.id}">
      <label class="small"><b>Por que esta prática não se aplica à sua empresa?</b> (obrigatório para finalizar)</label>
      <textarea data-just="${q.id}" ${canEdit ? '' : 'disabled'} placeholder="Ex.: a empresa não utiliza esse tipo de serviço.">${esc(a?.justification || '')}</textarea>
    </div>
    <details class="help"><summary>Como comprovar e exemplos de evidência</summary><div class="inner">
      <div><b>Exemplos de evidência:</b> ${esc(q.evidence_guidance)}</div>
      <div><b>Como confirmar a resposta:</b> ${esc(q.verification_guidance)}</div>
      <div><b>Sem arquivo?</b> ${esc(q.no_file_guidance)}</div>
      ${q.applicability_note ? `<div><b>Observação:</b> ${esc(q.applicability_note)}</div>` : ''}
      <div><b>Cuidados com a privacidade:</b> ${esc(q.privacy_guidance)}</div>
      <div class="small"><b>Referências:</b> ${esc(refs)}</div>
    </div></details>
    <div id="evb-${q.id}">${evidenceBlock(q, a)}</div>
  </article>`;
}

function renderPanel() {
  const d = dims[dimIndex];
  sessionStorage.setItem(`dim-${id}`, dimIndex);
  const last = dimIndex === dims.length - 1;
  $('#panel').innerHTML = `
    <span class="eyebrow">Dimensão ${dimIndex + 1} de ${dims.length}</span>
    <h1>${esc(d.name)}</h1>
    <p class="intro">${esc(d.description || '')}</p>
    ${dimIndex === 0 ? `<div class="scale">${SCALE.map((s, i) => `<div><b>${i}</b>${s}</div>`).join('')}</div>` : ''}
    ${d.questions.map(questionHtml).join('')}
    <div class="alert" id="fin-alert"></div>
    <div class="panel-foot">
      <button class="btn-ghost" id="prev" ${dimIndex === 0 ? 'disabled' : ''}>← Anterior</button>
      ${last ? (canEdit ? '<button class="btn btn-primary" id="finish">Revisar e finalizar <span class="ic">✓</span></button>' : '') : '<button class="btn btn-primary" id="next">Próxima dimensão <span class="ic">→</span></button>'}
    </div>`;
  renderSide();
}

function setSave(qid, state, text) {
  const el = $(`#ss-${qid}`); if (!el) return;
  el.className = `save-state ${state}`; el.textContent = text;
}

async function save(qid, body) {
  setSave(qid, '', 'Salvando...');
  try {
    await put(`/assessments/${id}/answers/${qid}`, body);
    const prev = answers[qid] || { evidences: [], evidence_status: 'NAO_INFORMADA' };
    answers[qid] = { ...prev, ...body, justification: body.justification ?? null };
    setSave(qid, 'ok', '✓ Salvo');
    return true;
  } catch (e) {
    setSave(qid, 'err', 'Não salvo');
    toast(e.message, true);
    return false;
  }
}

function refreshQuestion(qid) {
  const q = inst.questions.find((x) => x.id === qid);
  const el = $(`#q-${qid}`);
  const state = $(`#ss-${qid}`)?.outerHTML;
  el.outerHTML = questionHtml(q);
  if (state) $(`#ss-${qid}`).outerHTML = state;
  renderSide();
}

async function reloadEvidences(qid) {
  const r = await get(`/assessments/${id}/answers/${qid}/evidences`);
  answers[qid].evidences = r.items; answers[qid].evidence_status = r.status;
  const q = inst.questions.find((x) => x.id === qid);
  $(`#evb-${qid}`).innerHTML = evidenceBlock(q, answers[qid]);
}

main.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.dim !== undefined) { dimIndex = +t.dataset.dim; renderPanel(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.id === 'prev') { dimIndex--; renderPanel(); scrollTo({ top: 0 }); return; }
  if (t.id === 'next') { dimIndex++; renderPanel(); scrollTo({ top: 0 }); return; }
  if (t.id === 'finish') return finish();
  if (!canEdit) return;
  const qid = t.dataset.q;
  if (t.dataset.score !== undefined) { if (await save(qid, { type: 'SCORE', score: +t.dataset.score })) refreshQuestion(qid); return; }
  if (t.dataset.type) {
    const just = t.dataset.type === 'NA' ? (answers[qid]?.justification || '') : undefined;
    if (await save(qid, { type: t.dataset.type, ...(just ? { justification: just } : {}) })) { refreshQuestion(qid); if (t.dataset.type === 'NA') $(`[data-just="${qid}"]`)?.focus(); }
    return;
  }
  if (t.dataset.up) {
    const input = $(`[data-file="${t.dataset.up}"]`);
    if (!input.files[0]) return toast('Selecione um arquivo.', true);
    const fd = new FormData(); fd.append('evidence_type', 'FILE'); fd.append('file', input.files[0]);
    t.disabled = true;
    try { await api('POST', `/assessments/${id}/answers/${t.dataset.up}/evidences`, fd, { form: true }); toast('Arquivo enviado.'); await reloadEvidences(t.dataset.up); renderSide(); } catch (err) { toast(err.message, true); } finally { t.disabled = false; }
    return;
  }
  if (t.dataset.addtext) {
    const input = $(`[data-text="${t.dataset.addtext}"]`);
    const fd = new FormData(); fd.append('evidence_type', 'TEXT'); fd.append('description', input.value);
    try { await api('POST', `/assessments/${id}/answers/${t.dataset.addtext}/evidences`, fd, { form: true }); toast('Evidência registrada.'); await reloadEvidences(t.dataset.addtext); } catch (err) { toast(err.message, true); }
    return;
  }
  if (t.dataset.declare) {
    const fd = new FormData(); fd.append('evidence_type', 'DECLARED');
    try { await api('POST', `/assessments/${id}/answers/${t.dataset.declare}/evidences`, fd, { form: true }); toast('Evidência indicada.'); await reloadEvidences(t.dataset.declare); } catch (err) { toast(err.message, true); }
    return;
  }
  if (t.dataset.delEv) {
    const qid2 = t.closest('.ev').dataset.q;
    if (!(await confirmDialog('Remover evidência?', 'A evidência será removida desta resposta.', 'Remover'))) return;
    try { await del(`/evidences/${t.dataset.delEv}`); toast('Evidência removida.'); await reloadEvidences(qid2); } catch (err) { toast(err.message, true); }
  }
});

// Justificativa de NA: salva ao sair do campo
main.addEventListener('focusout', async (e) => {
  const ta = e.target.closest('textarea[data-just]');
  if (!ta || !canEdit) return;
  const qid = ta.dataset.just;
  if ((answers[qid]?.justification || '') === ta.value.trim()) return;
  if (await save(qid, { type: 'NA', justification: ta.value.trim() })) {
    $(`#na-${qid}`).classList.toggle('err', !ta.value.trim());
    $(`#q-${qid}`).classList.toggle('missing', !ta.value.trim());
    renderSide();
  }
});

async function finish() {
  const missing = inst.questions.filter((q) => !isAnswered(q) || needsFix(q));
  const box = $('#fin-alert');
  if (missing.length) {
    box.innerHTML = `Antes de finalizar, responda ou corrija: ${missing.map((q) => `<a href="#" data-goto="${q.id}" style="text-decoration:underline">${q.code}</a>`).join(', ')}.`;
    box.classList.add('show');
    return;
  }
  const p = await get(`/assessments/${id}/progress`);
  const ok = await confirmDialog('Finalizar o diagnóstico?', `Todas as ${p.total_questions} perguntas foram respondidas (cobertura de ${pct(p.coverage_percentage, 0)}). Após finalizar, as respostas e evidências ficam bloqueadas e a maturidade é calculada.`, 'Finalizar e calcular');
  if (!ok) return;
  try {
    await post(`/assessments/${id}/finalize`);
    sessionStorage.removeItem(`dim-${id}`);
    location.href = `/resultado.html?id=${id}&novo=1`;
  } catch (err) {
    box.textContent = err.message + (err.fields ? ` ${Object.entries(err.fields).map(([k, v]) => `${k}: ${v}`).join(' · ')}` : '');
    box.classList.add('show');
  }
}

main.addEventListener('click', (e) => {
  const a = e.target.closest('[data-goto]'); if (!a) return;
  e.preventDefault();
  const q = inst.questions.find((x) => x.id === a.dataset.goto);
  dimIndex = dims.findIndex((d) => d.id === q.dimension_id);
  renderPanel();
  $(`#q-${q.id}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
});

renderShell();
renderPanel();
