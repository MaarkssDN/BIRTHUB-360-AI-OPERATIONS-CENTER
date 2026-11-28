# Matriz de riscos da base antiga

Riscos observados na base `c01501c6c0994b0c1beedb7867ab3c6ca4ac79b4` (referência somente leitura `MaarkssDN/11`). Os valores de e-mail e de identificador de pasta do Drive **não** são reproduzidos aqui.

Status neste repositório: **mitigado no PR #1**, **não portado** ou **aberto** com dono sugerido.

| ID | Severidade | Risco na base antiga | Status neste repo | Dono sugerido |
| --- | --- | --- | --- | --- |
| R-01 | P0 | Rotas `/api` sem authn/authz, inclusive estado consolidado e mutações | Não portado. Não há rotas de dados nem de mutação. Restam `GET /api/health` e `GET /api/ready`, sem registros. Authn/authz ainda não existe | Segurança |
| R-02 | P0 | `listen` em `0.0.0.0` | Mitigado. O Express só aceita loopback. O WebSocket de HMR do Vite, que no modo dev chegava a escutar em `*:24678`, também fica em `127.0.0.1` (`server.ws.host`) | Segurança |
| R-03 | P0 | Autoaprovação via `auditorAgentId` vindo do body | Não portado como rota. O contrato do arquivo recusa missão cujo executor, depois do trim, é igual ao auditor. Não há rota que aceite o ator pelo body | Segurança |
| R-04 | P0 | Ponte Devin sem mTLS/HMAC | Não portado. Sem endpoint e sem runner. O contrato só aceita a ponte desligada. `.env.example` deixa `B360_DEVIN_LOCAL_BRIDGE_ENABLED=false` | Segurança |
| R-05 | P1 | Sem CI e sem Dependabot | Mitigado no PR #1. Workflow `ci` e Dependabot semanal (npm e github-actions) | Plataforma |
| R-06 | P1 | D1 representado por JSON versionado e alterado pelo `npm test` | Mitigado no PR #1. `data/` fica fora do Git. Os testes copiam a fixture sintética para um `mkdtemp` e não gravam na fixture. JSON inválido não é substituído por seed. O schema SQL/D1 em si não entrou neste PR | Persistência |
| R-07 | P1 | Inventário divergente (44 vs 45 tabelas) e status de ondas divergente | Não portado. Aberto | Persistência (tabelas) e plataforma (ondas) |
| R-08 | P1 | Onda 00 sem artefatos | Aberto. Este PR não produz o dossiê da onda 00 | Plataforma |
| R-09 | P2 | E-mail pessoal e ID de pasta do Drive no repositório público (seed, `.env.example`, docs) | Não portado nos arquivos deste PR: os valores não foram copiados. Aberto nos metadados de autor do commit base `01976565`, anterior ao PR e fora do diff. Corrigir isso reescreveria a `main` e não cabe neste branch. Pendente de aceite de risco por escrito do Marcelo, ou de recriação do repositório. Bloqueia G7, não o G4 deste PR | Segurança |
| R-10 | P2 | Filtro de injection só por regex | Não portado. Aberto para quando houver entrada livre | Segurança |
| R-11 | P2 | Lint era só `tsc` | Mitigado no PR #1. ESLint flat com `typescript-eslint` e React; `typecheck` é `tsc --noEmit` em strict | Plataforma |
| R-12 | P2 | Dois lockfiles | Mitigado no PR #1. Só `package-lock.json`. CI usa `npm ci` | Plataforma |
| R-13 | P2 | Bundle de client em 884 kB | Mitigado no PR #1. JS do client: 221,23 kB (gzip 69,40 kB). CSS: 1,24 kB (gzip 0,61 kB) | Plataforma |

## Notas

- R-02 cobre o processo Express e o WebSocket de HMR. Os dois ficam em loopback.
- R-09 não reproduz o e-mail. O valor continua só no metadado do commit base, que este PR não reescreve.
- R-01 permanece aberto no que diz respeito a autenticação: o próximo time de segurança precisa colocar authn/authz antes de qualquer rota de domínio.
- R-06 não entrega o banco transacional da onda 04. A persistência deste PR é o contrato mínimo em arquivo, fail-closed.
- G4 e G7 estão em `docs/gates-G4-G7.md` e continuam **pendentes de ratificação**. Não há GO de release.
