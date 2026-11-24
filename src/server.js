import { config } from './config.js';
import { bootstrap } from './bootstrap.js';
import { createApp } from './app.js';
import { startWorker, stopWorker } from './services/reports.js';
import { closeDb } from './db.js';
import { log } from './lib/logger.js';

bootstrap();
const app = createApp();
const server = app.listen(config.port, () => {
  log.info('server.started', { url: config.baseUrl, env: config.env, ai_provider: config.ai.provider });
  console.log(`\n  PrismaTI rodando em ${config.baseUrl}\n`);
});
startWorker();

function shutdown() {
  log.info('server.stopping');
  stopWorker();
  server.close(() => { closeDb(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
