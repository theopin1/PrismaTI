// Limite de requisições em memória (RNF-005). Para várias instâncias, trocar por um store compartilhado.
import { tooMany } from './errors.js';

const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

export function hit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count += 1;
  return b.count <= limit;
}

export function rateLimit({ limit, windowMs, key = (req) => req.ip, name }) {
  return (req, _res, next) => {
    if (!hit(`${name}:${key(req)}`, limit, windowMs)) return next(tooMany());
    next();
  };
}

export const resetRateLimits = () => buckets.clear();
