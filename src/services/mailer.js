// Serviço de e-mail substituível (RNF-045): SMTP quando SMTP_URL está configurado;
// caso contrário grava as mensagens em storage/outbox (útil em desenvolvimento/homologação).
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

let transport;
function getTransport() {
  if (!config.mail.smtpUrl) return null;
  transport ||= nodemailer.createTransport(config.mail.smtpUrl);
  return transport;
}

export async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (t) {
    await t.sendMail({ from: config.mail.from, to, subject, text });
    log.info('mail.sent', { subject });
    return { delivered: true };
  }
  const dir = path.join(config.storageDir, 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`);
  fs.writeFileSync(file, `Para: ${to}\nAssunto: ${subject}\n\n${text}\n`);
  log.info('mail.outbox', { file: path.relative(config.storageDir, file) });
  return { delivered: false, outboxFile: file };
}

export function inviteMail({ name, companyName, role, link, hours }) {
  const papel = role === 'GESTOR' ? 'Gestor da Empresa' : 'Responsável de TI';
  return {
    subject: 'Seu convite para o PrismaTI',
    text: `Olá${name ? `, ${name}` : ''}!\n\nVocê foi convidado(a) para acessar o PrismaTI como ${papel} da empresa ${companyName}.\n\nPara ativar sua conta e criar sua senha, acesse:\n${link}\n\nO convite é individual, vale por ${hours} horas e só pode ser usado uma vez.\n\nSe você não esperava este convite, ignore esta mensagem.\n\nEquipe PrismaTI`,
  };
}

export function resetMail({ name, link, minutes }) {
  return {
    subject: 'Redefinição de senha do PrismaTI',
    text: `Olá, ${name}!\n\nRecebemos um pedido para redefinir sua senha. Para criar uma nova senha, acesse:\n${link}\n\nO link vale por ${minutes} minutos e só pode ser usado uma vez. Se você não fez esse pedido, ignore esta mensagem.\n\nEquipe PrismaTI`,
  };
}
