// Uso: npm run backup  (pode rodar com o servidor ligado; agende diariamente para RPO de 24h)
import { createBackup, verifyBackup } from '../src/services/backup.js';

const { dir, manifest } = createBackup();
verifyBackup(dir);
console.log(`Backup criado e verificado em ${dir} (${manifest.evidences.length} evidência(s)).`);
