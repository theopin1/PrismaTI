// Erros padronizados (RNF-024, RNF-046, RNF-051, RNF-052).
export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const badRequest = (message, fields) => new AppError(400, 'VALIDATION_ERROR', message, fields);
export const unauthorized = (message = 'Sessão inválida ou expirada. Entre novamente.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Você não tem permissão para esta operação.') => new AppError(403, 'FORBIDDEN', message);
// Recursos de outras empresas respondem 404 para não revelar a existência do identificador (RNF-009).
export const notFound = (message = 'Recurso não encontrado.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
export const tooMany = (message = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.') => new AppError(429, 'RATE_LIMITED', message);

// Converte erros do zod em { campo: mensagem } para destacar os campos no formulário.
export function zodFields(err) {
  const fields = {};
  for (const issue of err.issues || []) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw badRequest('Alguns campos precisam de correção.', zodFields(r.error));
  return r.data;
}
