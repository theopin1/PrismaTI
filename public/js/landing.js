// Landing page: FAQ em acordeão e animações de entrada.
const FAQ = [
  ['O que é o PrismaTI?', 'É uma plataforma que avalia a maturidade da Tecnologia da Informação da sua empresa, identificando pontos fortes, fragilidades e oportunidades de melhoria.'],
  ['Para quem o PrismaTI é indicado?', 'Para pequenas e médias empresas que querem entender e melhorar suas práticas de tecnologia, mesmo sem ter uma equipe de TI ou conhecimento técnico.'],
  ['Como funciona o diagnóstico?', 'Você responde 30 perguntas simples, organizadas em 7 dimensões (governança, dados e pessoas, acessos, backup, serviços e fornecedores, projetos e mudanças, medição e melhoria). Cada pergunta tem cinco alternativas, além de "Não se aplica" e "Não sei informar", com exemplos de como comprovar a resposta.'],
  ['O que recebo ao finalizar o diagnóstico?', 'Sua maturidade geral e por dimensão, a cobertura das respostas e um relatório gerado com apoio de inteligência artificial com fragilidades, recomendações priorizadas, plano de ação e roadmap de 30, 60 e 90 dias, que pode ser exportado em PDF.'],
  ['Preciso ter conhecimento técnico para utilizar a plataforma?', 'Não. As perguntas usam linguagem do dia a dia e trazem explicações e exemplos. Se quiser, você pode convidar o responsável de TI da empresa (interno ou terceirizado) para consultar o questionário e ajudar nas respostas.'],
  ['O diagnóstico é uma auditoria ou certificação?', 'Não. O resultado é orientativo e baseado nas respostas declaradas pela empresa, usando boas práticas do COBIT, ISO/IEC 27001 e 27002, ITIL e CMMI. Ele não substitui auditorias especializadas nem representa certificação ou conformidade oficial.'],
  ['Posso contratar apenas um diagnóstico?', 'Sim. O Diagnóstico Avulso permite fazer uma avaliação completa pontualmente. Depois da contratação, liberamos o acesso da sua empresa e enviamos os convites por e-mail.'],
  ['Quais são os planos disponíveis?', 'Diagnóstico Avulso (R$ 50,00 por consulta), Plano Mensal (R$ 199,00 por mês) e Plano Anual (R$ 2.000,00 por ano), que oferece o melhor custo-benefício para acompanhar a evolução da sua TI.'],
];

const list = document.getElementById('faq');
if (list) {
  list.innerHTML = FAQ.map(([q, a], i) => `
    <div class="faq-item${i === 0 ? ' open' : ''}">
      <button class="faq-q" aria-expanded="${i === 0}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${q}</span>
        <span class="pm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path class="v" d="M12 5v14"/></svg></span></button>
      <div class="faq-a"><div><p>${a}</p></div></div>
    </div>`).join('');
  const sync = () => list.querySelectorAll('.faq-item').forEach((it) => { it.querySelector('.v').style.display = it.classList.contains('open') ? 'none' : ''; });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.faq-q'); if (!btn) return;
    const item = btn.parentElement; const open = !item.classList.contains('open');
    list.querySelectorAll('.faq-item').forEach((it) => { it.classList.remove('open'); it.querySelector('.faq-q').setAttribute('aria-expanded', 'false'); });
    if (open) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    sync();
  });
  sync();
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
}, { threshold: 0.12 }) : null;
document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
