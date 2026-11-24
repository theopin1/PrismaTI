// Cria o banco, carrega o instrumento oficial (30 perguntas) e, se informado, o administrador.
// Uso: ADMIN_EMAIL=voce@empresa.com ADMIN_PASSWORD=SenhaForte123 npm run seed
import { bootstrap } from '../src/bootstrap.js';
import { one } from '../src/db.js';

bootstrap();
const admins = one('SELECT COUNT(*) n FROM users WHERE is_platform_admin = 1').n;
const qs = one('SELECT COUNT(*) n FROM questions').n;
console.log(`Banco pronto: ${qs} perguntas cadastradas, ${admins} administrador(es).`);
if (!admins) console.log('Defina ADMIN_EMAIL e ADMIN_PASSWORD (no .env ou no comando) para criar o administrador.');
