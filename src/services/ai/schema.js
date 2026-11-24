// Estrutura versionada do relatório gerado pela IA (7.3 a 7.6, RNF-031).
import { z } from 'zod';

export const OUTPUT_SCHEMA_VERSION = 'report-schema-1.0';
export const PROMPT_VERSION = 'prompt-1.0';

const Priority = z.enum(['Alta', 'Média', 'Baixa']);
const Level = z.enum(['Baixo', 'Médio', 'Alto']);

export const ReportSchema = z.object({
  executive_summary: z.string().min(1),
  maturity_interpretation: z.string().min(1),
  dimension_analysis: z.array(z.object({
    dimension_code: z.string(),
    interpretation: z.string(),
    positive_practices: z.array(z.string()),
    improvement_opportunities: z.array(z.string()),
  })),
  strengths: z.array(z.object({ title: z.string(), question_codes: z.array(z.string()), description: z.string() })),
  weaknesses: z.array(z.object({
    title: z.string(),
    dimension_code: z.string(),
    question_codes: z.array(z.string()).min(1),
    description: z.string(),
    basis: z.enum(['Declarado', 'Inferido']),
  })),
  recommendations: z.array(z.object({
    id: z.string(),
    title: z.string(),
    dimension_code: z.string(),
    question_codes: z.array(z.string()).min(1),
    weakness: z.string(),
    potential_consequence: z.string(),
    recommended_action: z.string(),
    expected_benefit: z.string(),
    priority: Priority,
    priority_justification: z.string(),
    risk: Level,
    impact: Level,
    effort: Level,
  })).min(1),
  action_plan: z.array(z.object({
    recommendation_id: z.string(),
    what: z.string(),
    why: z.string(),
    steps: z.array(z.string()).min(1),
    executor_profile: z.string(),
    resources: z.string(),
    expected_benefit: z.string(),
    completion_evidence: z.string(),
  })),
  roadmap: z.array(z.object({
    phase: z.string(),
    period: z.string(),
    actions: z.array(z.object({ recommendation_id: z.string(), title: z.string(), depends_on: z.array(z.string()) })),
  })).min(1),
  limitations: z.array(z.string()),
  final_considerations: z.string(),
});

// Validação semântica: referências precisam existir na avaliação (7.6).
export function validateReport(content, { questionCodes, dimensionCodes }) {
  const parsed = ReportSchema.safeParse(content);
  if (!parsed.success) return { ok: false, error: 'Estrutura inválida: ' + parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const r = parsed.data;
  const qs = new Set(questionCodes), ds = new Set(dimensionCodes);
  const recIds = new Set(r.recommendations.map((x) => x.id));
  const errors = [];
  for (const w of r.weaknesses) {
    if (!ds.has(w.dimension_code)) errors.push(`fragilidade com dimensão inexistente ${w.dimension_code}`);
    for (const c of w.question_codes) if (!qs.has(c)) errors.push(`fragilidade cita pergunta inexistente ${c}`);
  }
  for (const rec of r.recommendations) {
    if (!ds.has(rec.dimension_code)) errors.push(`recomendação ${rec.id} com dimensão inexistente`);
    for (const c of rec.question_codes) if (!qs.has(c)) errors.push(`recomendação ${rec.id} cita pergunta inexistente ${c}`);
  }
  for (const d of r.dimension_analysis) if (!ds.has(d.dimension_code)) errors.push(`análise com dimensão inexistente ${d.dimension_code}`);
  for (const a of r.action_plan) if (!recIds.has(a.recommendation_id)) errors.push(`plano cita recomendação inexistente ${a.recommendation_id}`);
  for (const p of r.roadmap) for (const a of p.actions) {
    if (!recIds.has(a.recommendation_id)) errors.push(`roadmap cita recomendação inexistente ${a.recommendation_id}`);
    for (const dep of a.depends_on) if (!recIds.has(dep)) errors.push(`roadmap: dependência inexistente ${dep}`);
  }
  if (errors.length) return { ok: false, error: errors.slice(0, 5).join('; ') };
  return { ok: true, data: r };
}
