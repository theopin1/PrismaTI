// Montagem da aplicação Express (separada do server.js para facilitar testes).
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config, isProd, ROOT } from './config.js';
import { AppError } from './lib/errors.js';
import { log } from './lib/logger.js';
import { loadSession } from './lib/auth.js';
import { rateLimit } from './lib/ratelimit.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import appRoutes from './routes/app.js';

export const API_PREFIX = '/api/v1'; // RNF-049: versão da API no caminho

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  // Identificador de rastreamento por requisição (RNF-039)
  app.use((req, res, next) => {
    req.traceId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 64);
    res.setHeader('X-Request-Id', req.traceId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (!req.path.startsWith('/api/')) return;
      log.info('http', { traceId: req.traceId, method: req.method, path: req.path, status: res.statusCode, ms: Number(process.hrtime.bigint() - start) / 1e6 });
    });
    next();
  });

  // HTTPS em produção (RNF-001) e cabeçalhos de segurança
  app.use((req, res, next) => {
    if (isProd && req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
    next();
  });

  app.use(express.json({ limit: '200kb' }));

  // Proteção CSRF: mutações na API exigem o cabeçalho X-PrismaTI (formulários de outros sites não conseguem enviá-lo).
  app.use(API_PREFIX, (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['x-prismati'] !== '1') {
      return next(new AppError(403, 'CSRF', 'Requisição bloqueada por segurança. Recarregue a página e tente novamente.'));
    }
    next();
  });
  app.use(API_PREFIX, rateLimit({ name: 'api', limit: config.rateLimit.apiPerMinute, windowMs: 60_000 }));
  app.use(API_PREFIX, loadSession);

  app.get(`${API_PREFIX}/health`, (_req, res) => res.json({ ok: true, env: config.env, ai_provider: config.ai.provider }));
  app.get(`${API_PREFIX}/openapi.yaml`, (_req, res) => res.sendFile(path.join(ROOT, 'docs/openapi.yaml')));
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/admin`, adminRoutes);
  app.use(API_PREFIX, appRoutes);
  app.use(API_PREFIX, (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint não encontrado.')));

  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));

  // Tratamento de erros padronizado, sem expor detalhes internos (RNF-024)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let e = err;
    if (err instanceof multer.MulterError) {
      e = new AppError(400, 'VALIDATION_ERROR', err.code === 'LIMIT_FILE_SIZE' ? `Arquivo maior que ${config.uploads.maxBytes / 1024 / 1024} MB.` : 'Falha no envio do arquivo.', { file: 'Arquivo inválido.' });
    } else if (err?.type === 'entity.parse.failed') {
      e = new AppError(400, 'VALIDATION_ERROR', 'JSON inválido.');
    } else if (err?.type === 'entity.too.large') {
      e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Conteúdo muito grande.');
    }
    if (!(e instanceof AppError)) {
      log.error('unhandled', { traceId: req.traceId, message: err?.message, stack: isProd ? undefined : err?.stack });
      e = new AppError(500, 'INTERNAL_ERROR', 'Ocorreu um erro inesperado. Tente novamente; se persistir, informe o código de rastreamento ao suporte.');
    }
    res.status(e.status).json({ error: { code: e.code, message: e.message, fields: e.fields, traceId: req.traceId } });
  });

  return app;
}
