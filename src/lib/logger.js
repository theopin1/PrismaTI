// Logs operacionais em JSON (RNF-037), com redação de dados sensíveis (RNF-040).
const SENSITIVE = /pass(word)?|senha|token|secret|authorization|cookie|api[_-]?key|mfa|^code$/i;

export function redact(value, depth = 0) {
  if (value == null || depth > 5) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

function write(level, msg, data) {
  if (process.env.PRISMATI_SILENT === '1' && level !== 'error') return;
  const line = { ts: new Date().toISOString(), level, msg, ...redact(data || {}) };
  (level === 'error' ? process.stderr : process.stdout).write(JSON.stringify(line) + '\n');
}

export const log = {
  info: (msg, data) => write('info', msg, data),
  warn: (msg, data) => write('warn', msg, data),
  error: (msg, data) => write('error', msg, data),
};
