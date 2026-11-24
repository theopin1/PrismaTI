# PrismaTI

Diagnóstico inicial de maturidade em TI para pequenas e médias empresas. A empresa responde 30 perguntas em 7 dimensões, o sistema calcula a maturidade e gera um relatório com recomendações, plano de ação e roadmap, exportável em PDF.

## O que tem aqui

- **Landing page** (`/`) fiel ao layout de referência.
- **Acesso por convite**, sem cadastro público, com 3 perfis:
  - **Administrador** da plataforma: cadastra empresas, envia convites, mantém o questionário, acompanha avaliações, uso de IA e auditoria.
  - **Gestor da Empresa**: responde, finaliza, solicita relatórios e exporta PDF.
  - **Responsável de TI**: consulta tudo da própria empresa, sem editar.
- **Questionário** com 30 perguntas (GOV 4, DAD 4, ACE 5, BAC 4, SER 5, PRO 5, MED 3), notas de 0 a 4, "Não se aplica" com justificativa, "Não sei informar", orientações e evidências opcionais. As respostas são salvas automaticamente.
- **Cálculo oficial no servidor** (seção 6 do documento de requisitos), com cobertura, preenchimento e situação (Apto à revisão, Preliminar ou Sem dados suficientes).
- **Relatório por IA** gerado em fila (Em fila → Processando → Concluído/Falha), com novas tentativas, versões preservadas, limites mensais e registro de consumo. Sem chave de API, um gerador local produz o relatório.
- **PDF**, auditoria, backup e restauração, API documentada em OpenAPI.

## Requisitos

- Node.js **22.13 ou mais novo** (usa o SQLite embutido do Node, sem banco externo e sem compilação nativa).
- Windows, Linux ou macOS.

## Instalar e rodar

```bash
npm install
copy .env.example .env      # no Linux/macOS: cp .env.example .env
# edite o .env: pelo menos ADMIN_EMAIL e ADMIN_PASSWORD
npm start
```

Abra http://localhost:3000. Entre com o e-mail e a senha do administrador definidos no `.env`.

Primeiro uso:

1. Em **Administração → Empresas**, crie a empresa.
2. Na página da empresa, envie o convite do **Gestor** (e, se quiser, do **Responsável de TI**).
3. Sem SMTP configurado, o link de ativação aparece na tela para você repassar. Os e-mails também ficam salvos em `storage/outbox`.
4. O Gestor ativa a conta, inicia o diagnóstico, responde, finaliza e solicita o relatório.

Para desenvolvimento com recarga automática: `npm run dev`.

## Configuração (.env)

Todas as opções estão comentadas em `.env.example`. As principais:

| Variável | Para quê |
|---|---|
| `NODE_ENV` | `development`, `homologacao` ou `production`. Em produção: HTTPS obrigatório, HSTS, cookies `Secure`, MFA obrigatório para administradores e o link de convite nunca aparece na tela. |
| `BASE_URL` | Endereço público, usado nos links dos e-mails. |
| `ANTHROPIC_API_KEY` | Liga a geração de relatórios pela IA da Anthropic (modelo `claude-opus-5-5`). |
| `SMTP_URL` | Servidor de e-mail para convites e redefinição de senha. |
| `ADMIN_CAN_VIEW_ANSWERS` | Se o administrador pode ver respostas e evidências das empresas (padrão: não). |
| `AI_MONTHLY_*` | Limites mensais de relatórios e tokens por empresa e no total. |

## Ambientes

Use um `.env` por ambiente (por exemplo `.env.homologacao`) e aponte com `PRISMATI_ENV_FILE`:

```bash
PRISMATI_ENV_FILE=.env.homologacao npm start
```

Cada ambiente deve ter seu próprio banco (`DB_FILE`), pasta de arquivos (`STORAGE_DIR`) e chave de IA.

## Produção

- Coloque o sistema atrás de um proxy reverso com certificado (Nginx, Caddy, IIS ou o balanceador do provedor) e use `TRUST_PROXY=true`.
- Rode como serviço (PM2, systemd, NSSM no Windows) para reiniciar sozinho.
- Agende `npm run backup` diariamente e copie a pasta `backups` para fora do servidor.
- Monitore `GET /api/v1/health`.

## Backup e restauração

```bash
npm run backup                                   # pode rodar com o servidor ligado
npm run restore -- backups/<pasta-do-backup> --yes   # com o servidor PARADO
```

O backup copia o banco e as evidências e grava um manifesto com hash de cada arquivo, verificado antes de restaurar. O banco atual é preservado com o sufixo `.pre-restore`.

## Testes

```bash
npm test                                   # 45 testes: cálculo, permissões, fluxo completo, backup, MFA
npm run loadtest -- --users 50 --minutes 2  # carga com 50 usuários simultâneos (CA-MVP-20)
```

O teste de carga sobe um servidor temporário com banco próprio e informa o p95 de cada operação e a taxa de erros.

## API

Documentação OpenAPI em `docs/openapi.yaml`, também servida em `/api/v1/openapi.yaml`. Todas as rotas usam o prefixo `/api/v1` e exigem o cabeçalho `X-PrismaTI: 1` nas requisições que alteram dados (proteção contra CSRF).

## Versionamento

- **API:** o prefixo `/api/v1` só muda em alterações incompatíveis. Novos campos são adicionados sem trocar a versão.
- **Questionário:** cada versão fica gravada. Versões publicadas ou já usadas não podem ser editadas. Para mudar perguntas, crie uma nova versão em Administração → Questionário, edite e publique. Avaliações antigas continuam ligadas à versão em que foram respondidas.
- **Cálculo, prompt e formato do relatório:** cada resultado guarda a versão do cálculo (`calc-1.0.0`), e cada relatório guarda as versões do prompt e do esquema de saída.
- **Banco:** o esquema é criado e atualizado automaticamente na inicialização.

## Estrutura

```
src/
  app.js, server.js, bootstrap.js, config.js, db.js
  lib/        autenticação, segurança, auditoria, limites, logs
  routes/     auth.js, app.js (empresa), admin.js
  services/   cálculo, questionário, avaliações, relatórios, IA, PDF, e-mail, arquivos, backup
data/         questionário oficial (30 perguntas da planilha)
public/       landing page e telas do sistema
scripts/      seed, backup, restore, teste de carga
test/         testes automatizados
docs/         openapi.yaml
```
