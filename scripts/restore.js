// Uso: npm run restore -- backups/prismati-AAAA-MM-DD... --yes   (com o servidor PARADO)
import { restoreBackup } from '../src/services/backup.js';

const dir = process.argv[2];
if (!dir || !process.argv.includes('--yes')) {
  console.error('Uso: npm run restore -- <pasta-do-backup> --yes\nPare o servidor antes. O banco atual é preservado com o sufixo .pre-restore.');
  process.exit(1);
}
const m = restoreBackup(dir);
console.log(`Restauração concluída a partir de ${dir} (backup de ${m.created_at}). Inicie o servidor com npm start.`);
