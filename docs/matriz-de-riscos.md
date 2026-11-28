# Matriz de riscos da base antiga

Riscos observados na base `c01501c6c0994b0c1beedb7867ab3c6ca4ac79b4` (referência somente leitura `MaarkssDN/11`). Os valores de e-mail e de identificador de pasta do Drive **não** são reproduzidos aqui.

Status neste repositório: **mitigado no PR #1**, **não portado** ou **aberto** com dono sugerido.

| ID | Severidade | Risco na base antiga | Status neste repo | Dono sugerido |
| --- | --- | --- | --- | --- |
| R-01 | P0 | Rotas `/api` sem authn/authz, inclusive estado consolidado e mutações | Não portado. Não há rotas de dados nem de mutação. Restam `GET /api/health` e `GET /api/ready`, sem registros. Authn/authz ainda não existe | Segurança |
| R-02 | P0 | `listen` em `0.0.0.0` | Mitigado no PR #1. O processo só escuta em loopback (`127.0.0.1`, `localhost`, `::1`) e recusa bind público | Segurança |
| R-03 | P0 | Autoaprovação via `auditorAgentId` vindo do body | Não portado. Não há rota de auditoria. A checagem pura de independência não trata o body como autoridade | Segurança |
| R-04 | P0 | Ponte Devin sem mTLS/HMAC | Não portado. Sem endpoint e sem runner. O contrato só aceita a ponte desligada. `.env.example` deixa `B360_DEVIN_LOCAL_BRIDGE_ENABLED=false` | Segurança |
| R-05 | P1 | Sem CI e sem Dependabot | Mitigado no PR #1. Workflow `ci` e Dependabot semanal (npm e github-actions) | Plataforma |
| R-06 | P1 | D1 representado por JSON versionado e alterado pelo `npm test` | Parcial. `data/` fica fora do Git e o `npm test` não grava a fixture. O schema SQL agora é local: 47 tabelas de domínio, runner idempotente, sem D1 e sem wrangler. A API ainda lê o JSON | Persistência |
| R-07 | P1 | Inventário divergente (44 vs 45 tabelas) e status de ondas divergente | Contagem corrigida: a `0001` cria 44 tabelas e a `0002` cria mais 3. Total de domínio: 47. `schema_migrations` não entra. O status das ondas continua em aberto | Persistência (tabelas) e plataforma (ondas) |
| R-08 | P1 | Onda 00 sem artefatos | Aberto. Este PR não produz o dossiê da onda 00 | Plataforma |
| R-09 | P2 | E-mail pessoal e ID de pasta do Drive no repositório público (seed, `.env.example`, docs) | Não portado. Os valores não foram copiados | Segurança |
| R-10 | P2 | Filtro de injection só por regex | Não portado. Aberto para quando houver entrada livre | Segurança |
| R-11 | P2 | Lint era só `tsc` | Mitigado no PR #1. ESLint flat com `typescript-eslint` e React; `typecheck` é `tsc --noEmit` em strict | Plataforma |
| R-12 | P2 | Dois lockfiles | Mitigado no PR #1. Só `package-lock.json`. CI usa `npm ci` | Plataforma |
| R-13 | P2 | Bundle de client em 884 kB | Mitigado no PR #1. JS do client: 221,23 kB (gzip 69,40 kB). CSS: 1,24 kB (gzip 0,61 kB) | Plataforma |

## Notas

- R-01 permanece aberto no que diz respeito a autenticação: o próximo time de segurança precisa colocar authn/authz antes de qualquer rota de domínio.
- R-06 não entrega sozinho o banco transacional da onda 04. O JSON continua fail-closed. O schema relacional é aplicado só por `npm run migrate:local`.
- R-07: a contagem anunciada de 45 estava errada. A fonte da `0001` tem 44 `CREATE TABLE`. A 45ª entidade é `ImportedConversations`, junto com `Outbox` e `EventLog` na `0002`.
- G4 e G7 estão em `docs/gates-G4-G7.md` e continuam **pendentes de ratificação**. Não há GO de release.
