// Provedor local, determinístico e sem custo. Usado quando não há chave de API configurada
// (desenvolvimento, homologação, demonstração) ou como alternativa ao provedor externo.
// Produz o mesmo formato do provedor de IA, seguindo as regras da Seção 7.6.

const DIM_RISK = { ACE: 'Alto', BAC: 'Alto', GOV: 'Médio', DAD: 'Médio', SER: 'Médio', PRO: 'Baixo', MED: 'Baixo' };
const EXECUTOR = {
  GOV: 'Sócio ou gestor responsável, com apoio do responsável de TI',
  DAD: 'Gestor da empresa com apoio do responsável de TI (e orientação jurídica quando envolver dados pessoais)',
  ACE: 'Responsável de TI interno ou prestador de serviço de TI',
  BAC: 'Responsável de TI interno ou prestador de serviço de TI',
  SER: 'Responsável de TI ou fornecedor de suporte, acompanhado pelo gestor',
  PRO: 'Gestor da área envolvida com o responsável de TI',
  MED: 'Gestor da empresa com o responsável de TI',
};
// Dependências lógicas entre práticas (só usadas quando ambas aparecem nas recomendações)
const DEPENDS = { P15: ['P14'], P16: ['P14'], P11: ['P09'], P10: ['P09'], P20: ['P19'], P29: ['P18'], P26: ['P23'], P25: ['P24'], P06: ['P05'], P08: ['P06'], P03: ['P01'], P02: ['P01'] };
const LEVEL = { Baixo: 0, Médio: 1, Alto: 2 };

function effortOf(rec = '') {
  return /^(Ativar|Listar|Definir|Registrar|Usar|Começar|Criar lista|Criar canal|Manter lista)/i.test(rec.trim()) ? 'Baixo' : 'Médio';
}

export async function generateLocal(payload) {
  const qs = payload.questions;
  const dims = payload.results.dimensions;
  const scored = qs.filter((q) => q.answer_type === 'SCORE');

  const strengths = scored.filter((q) => q.score >= 3).sort((a, b) => b.score - a.score).slice(0, 6)
    .map((q) => ({ title: q.theme, question_codes: [q.code], description: `Prática declarada como "${q.selected_option}"` }));

  const weaknesses = scored.filter((q) => q.score <= 1).map((q) => ({
    title: q.theme, dimension_code: q.dimension_code, question_codes: [q.code],
    description: `A empresa declarou: "${q.selected_option}". ${q.score === 0 ? 'A prática não existe hoje.' : 'A prática ocorre de forma informal ou reativa.'}`,
    basis: 'Declarado',
  }));

  const candidates = scored.filter((q) => q.score <= 2).map((q) => {
    const risk = DIM_RISK[q.dimension_code] || 'Médio';
    const effort = effortOf(q.first_recommendation);
    let priority;
    if (q.score <= 1) priority = risk === 'Baixo' ? 'Média' : 'Alta';
    else priority = risk === 'Alto' ? 'Média' : 'Baixa';
    const rank = (2 - q.score) * 10 + LEVEL[risk] * 3 + (effort === 'Baixo' ? 1 : 0);
    return { q, risk, effort, priority, rank };
  }).sort((a, b) => b.rank - a.rank || a.q.code.localeCompare(b.q.code)).slice(0, 12);

  const recommendations = candidates.map((c, i) => ({
    id: `R${String(i + 1).padStart(2, '0')}`,
    title: c.q.first_recommendation || `Fortalecer: ${c.q.theme}`,
    dimension_code: c.q.dimension_code,
    question_codes: [c.q.code],
    weakness: `${c.q.theme}: resposta declarada "${c.q.selected_option}" (nota ${c.q.score} de 4).`,
    potential_consequence: consequenceFor(c.q.dimension_code),
    recommended_action: c.q.first_recommendation || 'Definir responsável e rotina mínima para a prática.',
    expected_benefit: `Elevar a prática "${c.q.theme}" para um nível estabelecido e acompanhado.`,
    priority: c.priority,
    priority_justification: `Nota ${c.q.score}/4 em uma prática de risco ${c.risk.toLowerCase()} para o negócio e esforço estimado ${c.effort.toLowerCase()}.`,
    risk: c.risk, impact: c.risk, effort: c.effort,
    deliverable: c.q.evidence_guidance || 'Registro simples da ação realizada.',
  }));

  const idByCode = Object.fromEntries(recommendations.map((r) => [r.question_codes[0], r.id]));
  const depsOf = (code) => (DEPENDS[code] || []).map((d) => idByCode[d]).filter(Boolean);

  const action_plan = recommendations.map((r) => {
    const q = qs.find((x) => x.code === r.question_codes[0]);
    return {
      recommendation_id: r.id,
      what: r.recommended_action,
      why: r.weakness,
      steps: [
        'Definir quem será responsável pela ação e um prazo realista.',
        r.recommended_action,
        'Comunicar a equipe envolvida e registrar o que foi feito.',
        'Revisar o resultado após 30 dias e ajustar se necessário.',
      ],
      executor_profile: EXECUTOR[r.dimension_code] || 'Responsável de TI',
      resources: 'Recursos e custos precisam ser validados pela empresa; em geral, tempo da equipe e ferramentas já existentes.',
      expected_benefit: r.expected_benefit,
      completion_evidence: q?.evidence_guidance || 'Registro simples da ação realizada.',
    };
  });

  const phases = [
    { phase: 'Organizar o essencial', period: 'Até 30 dias', p: 'Alta', expected_result: 'Inventário básico e responsáveis definidos.' },
    { phase: 'Colocar rotinas em prática', period: '31 a 60 dias', p: 'Média', expected_result: 'Rotinas simples documentadas e testadas.' },
    { phase: 'Acompanhar e melhorar', period: '61 a 90 dias', p: 'Baixa', expected_result: 'Primeiro ciclo de acompanhamento estruturado.' },
  ];
  const roadmap = phases.map((ph) => {
    const actions = recommendations.filter((r) => r.priority === ph.p).map((r) => ({ recommendation_id: r.id, title: r.title, depends_on: depsOf(r.question_codes[0]) }));
    return {
      phase: ph.phase,
      period: ph.period,
      activities: actions.slice(0, 5).map((a) => a.title),
      expected_result: ph.expected_result,
      actions,
    };
  }).filter((ph) => ph.actions.length);

  const nsQs = qs.filter((q) => q.answer_type === 'NS').map((q) => q.code);
  const naQs = qs.filter((q) => q.answer_type === 'NA').map((q) => q.code);
  const r = payload.results;
  const pct = (v) => (v === null ? 'indisponível' : `${v.toFixed(1).replace('.', ',')}%`);
  const weakest = [...dims].filter((d) => d.maturity_percentage !== null).sort((a, b) => a.maturity_percentage - b.maturity_percentage);
  const best = weakest.at(-1), worst = weakest[0];

  const limitations = [
    'As respostas foram declaradas pela empresa e não passaram por verificação humana; evidências anexadas não comprovam automaticamente as práticas.',
    'Este relatório é orientativo e não representa auditoria, certificação ou conformidade oficial com COBIT, ISO/IEC 27001/27002, ITIL 4 ou CMMI.',
  ];
  if (r.result_status !== 'APTO_REVISAO') limitations.push(`Diagnóstico ${r.result_status === 'SEM_DADOS' ? 'sem dados suficientes' : 'preliminar'}: cobertura de ${pct(r.overall_coverage)}${r.dimensions_without_data?.length ? ` e dimensões sem nota (${r.dimensions_without_data.join(', ')})` : ''}.`);
  if (nsQs.length) limitations.push(`As perguntas ${nsQs.join(', ')} foram respondidas como "Não sei informar" e não foram tratadas como ausência de prática; recomenda-se levantar essas informações.`);
  if (naQs.length) limitations.push(`As perguntas ${naQs.join(', ')} foram marcadas como "Não se aplica" (com justificativa) e não foram consideradas fragilidades.`);
  limitations.push('Prazos, custos e recursos são estimativas iniciais e precisam ser validados pela empresa.');

  return {
    content: {
      executive_summary: `A maturidade geral de TI da empresa foi calculada em ${pct(r.overall_maturity)}, classificada como "${r.overall_classification ?? 'indisponível'}". ${best ? `A dimensão mais desenvolvida é ${best.name} (${pct(best.maturity_percentage)})` : ''}${worst && worst !== best ? ` e a que exige mais atenção é ${worst.name} (${pct(worst.maturity_percentage)}).` : '.'} Foram identificadas ${weaknesses.length} fragilidade(s) declaradas e ${recommendations.length} recomendação(ões) priorizadas.`,
      maturity_interpretation: interpretation(r.overall_classification),
      dimension_analysis: dims.map((d) => {
        const dq = scored.filter((q) => q.dimension_code === d.code);
        return {
          dimension_code: d.code,
          interpretation: d.maturity_percentage === null
            ? 'Sem respostas numéricas suficientes para calcular a maturidade desta dimensão.'
            : `Maturidade de ${pct(d.maturity_percentage)} (${d.classification}), com cobertura de ${pct(d.coverage_percentage)}.`,
          positive_practices: dq.filter((q) => q.score >= 3).map((q) => `${q.code} · ${q.theme}`),
          improvement_opportunities: dq.filter((q) => q.score <= 2).map((q) => `${q.code} · ${q.theme}`),
        };
      }),
      strengths,
      weaknesses,
      recommendations: recommendations.length ? recommendations : [{
        id: 'R01', title: 'Manter e monitorar as práticas atuais', dimension_code: dims[0].code, question_codes: [qs[0].code],
        weakness: 'Nenhuma prática com nota igual ou inferior a 2 foi declarada.', potential_consequence: 'Práticas não revisadas tendem a se deteriorar com o tempo.',
        recommended_action: 'Revisar anualmente as práticas e acompanhar indicadores.', expected_benefit: 'Sustentar o nível de maturidade alcançado.',
        priority: 'Baixa', priority_justification: 'Nível de maturidade elevado em todas as perguntas.', risk: 'Baixo', impact: 'Baixo', effort: 'Baixo',
        deliverable: 'Registro anual de revisão das práticas e indicadores.',
      }],
      action_plan,
      roadmap: roadmap.length ? roadmap : [{
        phase: 'Acompanhar e melhorar',
        period: '61 a 90 dias',
        activities: ['Revisar anualmente as práticas e acompanhar indicadores.'],
        expected_result: 'Primeiro ciclo de acompanhamento estruturado.',
        actions: [{ recommendation_id: 'R01', title: 'Manter e monitorar as práticas atuais', depends_on: [] }],
      }],
      follow_up: {
        who: 'O gestor da empresa, com apoio de pessoa responsável pela TI ou prestador autorizado. Os papéis são sugeridos, não atribuídos automaticamente.',
        how_to_prove: 'Guardar registros simples: listas de acessos, testes de restauração, inventário de sistemas e cadastro de fornecedores.',
        next_step: 'Escolha uma ação da primeira fase, defina um responsável e registre a data planejada. O diagnóstico deverá ser revisado depois da implementação das melhorias.',
      },
      limitations,
      final_considerations: 'Recomenda-se começar pelas ações de curto prazo, que reduzem os riscos mais relevantes com menor esforço, e repetir o diagnóstico após a execução do roadmap para acompanhar a evolução. Decisões que envolvam investimentos relevantes, questões legais ou segurança crítica devem ser avaliadas por profissionais competentes.',
    },
    usage: { input_tokens: 0, output_tokens: 0 },
    model: 'prismati-local-1.0',
  };
}

function consequenceFor(dim) {
  return {
    GOV: 'Decisões de tecnologia sem dono e sem prioridade tendem a gerar gastos desnecessários e problemas recorrentes.',
    DAD: 'Informações importantes podem ser expostas ou usadas de forma inadequada, com possíveis impactos legais e de reputação.',
    ACE: 'Acessos indevidos ou sistemas desatualizados aumentam a chance de invasões, fraudes e vazamentos.',
    BAC: 'Em caso de falha, perda de equipamento ou ataque, a empresa pode perder dados ou ficar parada por muito tempo.',
    SER: 'Problemas podem demorar a ser resolvidos e fornecedores podem não entregar o combinado.',
    PRO: 'Mudanças e implantações sem planejamento podem causar paradas, atrasos e retrabalho.',
    MED: 'Sem medição e capacitação, é difícil saber se as melhorias funcionam e manter a qualidade.',
  }[dim] || 'Possível impacto nas operações.';
}

function interpretation(cls) {
  return {
    'Muito inicial': 'As práticas de TI ainda são praticamente inexistentes ou dependem de iniciativas pontuais. É o momento de estabelecer o básico: responsáveis, cópias de segurança e controle de acessos.',
    Inicial: 'Existem práticas informais e reativas. A empresa reage aos problemas quando surgem; o próximo passo é transformar essas práticas em rotinas simples e definidas.',
    'Em desenvolvimento': 'Parte das práticas já está implementada, mas de forma incompleta ou inconsistente. O foco deve ser padronizar e acompanhar as rotinas que já existem.',
    Estabelecido: 'As práticas principais estão definidas e são aplicadas regularmente. O desafio agora é medir resultados e melhorar continuamente.',
    Avançado: 'As práticas são monitoradas e melhoradas de forma contínua. O foco deve ser manter o nível e acompanhar mudanças no negócio e nos riscos.',
  }[cls] || 'Não há dados suficientes para interpretar a maturidade geral.';
}
