import { get, put, post, del, api, $, $$, esc, pct, mountHeader, toast, confirmDialog, fmtBytes } from './api.js';

const me = await mountHeader('painel', { collapsed: true });
const id = new URLSearchParams(location.search).get('id');
const main = $('#main');

const assessment = await get(`/assessments/${id}`);
if (assessment.status === 'FINALIZED') location.replace(`/resultado.html?id=${id}`);
const inst = await get(`/instrument-versions/${assessment.instrument.id}/questions`);
const canEdit = assessment.can_edit;
const answers = assessment.answers || {};
let dimIndex = Math.max(0, Number(sessionStorage.getItem(`dim-${id}`)) || 0);

const dims = inst.dimensions.map((d) => ({ ...d, questions: inst.questions.filter((q) => q.dimension_id === d.id) }));
const qNumber = new Map(inst.questions.map((q, idx) => [q.id, String(idx + 1).padStart(2, '0')]));
const ANSWER_LABEL = { NA: 'Não se aplica', NS: 'Não sei informar' };
const SCALE = ['Inexistente', 'Informal', 'Parcial', 'Estabelecido', 'Monitorado'];

function isAnswered(q) {
  return !!answers[q.id];
}
function needsFix(q) {
  const a = answers[q.id];
  return a && a.type === 'NA' && !(a.justification || '').trim();
}

function renderShell() {
  main.innerHTML = `
    <div class="page-head">
      <div>
        <span class="eyebrow">Diagnóstico de maturidade · ${esc(assessment.company.trade_name || assessment.company.legal_name)}</span>
        <h1>Avaliação da TI</h1>
        <p>${canEdit ? 'Responda com base na realidade atual da sua empresa. Suas respostas são salvas automaticamente.' : (me.role === 'TI' ? 'Modo consulta: o Responsável de TI pode ver as respostas e orientar o Gestor.' : 'Somente leitura.')}</p>
      </div>
      <a class="btn-sm ghost" href="/painel.html">Voltar ao painel</a>
    </div>
    <section class="step-bar">
      <div class="step-top">
        <div class="step-meta">
          <span class="step-tag" id="dstep"></span>
          <span class="small muted" id="ptext"></span>
          <span class="small muted" id="pcov"></span>
        </div>
        <strong id="ppct" style="font-family:var(--font-head);font-size:17px;color:#071b45">0%</strong>
      </div>
      <div class="progress" style="margin:12px 0 0"><i id="pbar"></i></div>
      <div class="small" id="pcov-warn" style="margin-top:10px;color:#9b6428;display:none"></div>
      <div class="step-pills" id="dimnav"></div>
    </section>
    <div id="panel"></div>`;
}

function renderSide() {
  const total = inst.questions.length;
  const done = inst.questions.filter(isAnswered).length;
  const naJust = inst.questions.filter((q) => answers[q.id]?.type === 'NA' && (answers[q.id]?.justification || '').trim()).length;
  const scored = inst.questions.filter((q) => answers[q.id]?.type === 'SCORE').length;
  const nsCount = inst.questions.filter((q) => answers[q.id]?.type === 'NS').length;
  const app = total - naJust;
  const cov = app > 0 ? (scored / app) * 100 : null;
  const fillPct = total ? (done / total) * 100 : 0;

  $('#dstep').textContent = `Etapa ${dimIndex + 1} de ${dims.length} · ${dims[dimIndex]?.name || ''}`;
  $('#pbar').style.width = `${fillPct}%`;
  $('#ppct').textContent = pct(fillPct, 0);
  $('#ptext').textContent = `${done} de ${total} respondidas`;
  $('#pcov').textContent = `Cobertura: ${cov === null ? '—' : pct(cov, 0)}${naJust || nsCount ? ` (${naJust} NA · ${nsCount} NS)` : ''}`;

  const warn = $('#pcov-warn');
  if (nsCount > 0 && done > 0 && (cov < 80 || nsCount > Math.floor(app * 0.2))) {
    warn.textContent = '⚠ Mais de 20% das perguntas aplicáveis estão como "Não sei informar": cobertura final abaixo de 80% gera diagnóstico Preliminar.';
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }

  $('#dimnav').innerHTML = dims.map((d, i) => {
    const n = d.questions.filter(isAnswered).length;
    const fix = d.questions.some(needsFix);
    const cls = i === dimIndex ? 'active' : fix ? 'warn' : (n === d.questions.length ? 'done' : '');
    return `<button type="button" class="step-pill ${cls}" data-dim="${i}" title="${esc(d.name)} (${n}/${d.questions.length})">${i + 1}${fix ? '!' : ''}</button>`;
  }).join('');
}

function optionBtn(q, o, a) {
  const sel = a?.type === 'SCORE' && a.score === o.score;
  return `<button class="opt ${sel ? 'sel' : ''}" data-q="${q.id}" data-score="${o.score}" ${canEdit ? '' : 'disabled'}><span class="s">${o.score}</span><span>${esc(o.description)} <span class="small muted">(${SCALE[o.score]})</span></span></button>`;
}

function evidenceBlock(q, a) {
  if (!a) return canEdit ? '<p class="small muted q-ev-foot">Evidência opcional — responda a pergunta para anexar arquivos ou descrever evidências.</p>' : '';
  const evs = a.evidences || [];
  const statusTxt = { NAO_INFORMADA: 'Nenhuma evidência', INDICADA: 'Evidência indicada', ENVIADA: 'Arquivo enviado' }[a.evidence_status || 'NAO_INFORMADA'];
  return `<div class="ev q-ev-foot" data-q="${q.id}">
    <div class="row"><span class="small"><b>Evidência opcional</b> · Documentos ou imagens</span><span class="badge">${statusTxt}</span><span class="spacer"></span>
    ${canEdit ? `<label class="btn-sm ghost" style="cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> Anexar arquivo<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" data-file="${q.id}"></label>` : ''}</div>
    ${evs.length ? `<div class="ev-list">${evs.map((e) => `<div class="ev-item"><span>${e.evidence_type === 'FILE' ? `📎 <a href="/api/v1/evidences/${e.id}/download" style="color:#1769ff">${esc(e.original_filename)}</a> <span class="muted">${fmtBytes(e.file_size)}</span>` : e.evidence_type === 'TEXT' ? `📝 ${esc(e.description)}` : `✔ ${esc(e.description)}`}</span>${canEdit ? `<button class="btn-sm danger" data-del-ev="${e.id}">Remover</button>` : ''}</div>`).join('')}</div>` : ''}
    ${canEdit ? `<div class="ev-forms">
      <div class="row"><input type="text" placeholder="Descreva a evidência (ex.: planilha de responsáveis no drive da empresa)" data-text="${q.id}" style="flex:1;min-width:220px;padding:10px 12px;border:1px solid #dbe5f2;border-radius:10px;font:inherit;font-size:13px"><button class="btn-sm ghost" data-addtext="${q.id}">Adicionar descrição</button><button class="btn-sm ghost" data-declare="${q.id}">Tenho, mas não posso compartilhar</button></div>
      <p class="small muted">⚠ ${esc(q.privacy_guidance || 'Não envie senhas, códigos de acesso ou dados pessoais.')} PDF, PNG ou JPEG até 5 MB.</p>
    </div>` : ''}
  </div>`;
}

function questionHtml(q) {
  const a = answers[q.id];
  const refs = q.references.map((r) => r.reference_code).join(' · ');
  const fw = q.primary_framework || q.references[0]?.framework_name || '';
  return `<article class="q-card ${needsFix(q) ? 'missing' : ''}" id="q-${q.id}">
    <div class="q-head">
      <div class="q-num">${qNumber.get(q.id) || esc(q.code)}</div>
      <div>
        <div class="q-kicker">${esc(q.theme || q.code)} ${fw ? `<span>(${esc(fw)})</span>` : ''}</div>
        <h3>${esc(q.title)}</h3>
        ${q.explanation ? `<p class="what">${esc(q.explanation)}</p>` : ''}
      </div>
      <span class="save-state" id="ss-${q.id}"></span>
    </div>
    <div class="opts">${q.options.map((o) => optionBtn(q, o, a)).join('')}</div>
    <div class="opts-special" style="margin-top:12px">
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
    <section class="box" style="margin-bottom:16px">
      <div class="dim-head">
        <div><span class="box-kicker">Dimensão ${dimIndex + 1} de ${dims.length}</span><h2>${esc(d.name)}</h2>
        ${d.description ? `<p class="small muted" style="margin-top:4px">${esc(d.description)}</p>` : ''}</div>
        <span class="small muted">Instrumento v${esc(assessment.instrument.version)}</span>
      </div>
      ${dimIndex === 0 ? `<div class="scale" style="margin-top:16px">${SCALE.map((s, i) => `<div><b>${i}</b>${s}</div>`).join('')}</div>` : ''}
    </section>
    <div class="q-stack">${d.questions.map(questionHtml).join('')}</div>
    <div class="alert" id="fin-alert"></div>
    <div class="panel-foot" style="border-top:0;padding-top:10px">
      <button class="btn-sm ghost" id="prev" ${dimIndex === 0 ? 'disabled' : ''}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Etapa anterior</button>
      ${last ? (canEdit ? '<button class="btn-cta" id="finish">Revisar e finalizar <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button>' : '') : '<button class="btn-cta" id="next">Próxima etapa <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>'}
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

main.addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-file]');
  if (!input || !canEdit || !input.files[0]) return;
  const qid = input.dataset.file;
  const fd = new FormData(); fd.append('evidence_type', 'FILE'); fd.append('file', input.files[0]);
  try { await api('POST', `/assessments/${id}/answers/${qid}/evidences`, fd, { form: true }); toast('Arquivo enviado.'); await reloadEvidences(qid); renderSide(); } catch (err) { toast(err.message, true); input.value = ''; }
});

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
  setTimeout(() => $(`#q-${q.id}`)?.scrollIntoView({ behavior: 'smooth' }), 50);
});

renderShell();
renderPanel();
