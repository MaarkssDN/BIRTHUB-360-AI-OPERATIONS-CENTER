# Baseline medido — PR #1

Medido nesta árvore, sucessora do head revisado `0a5ac66ee2cef451ee3293a1792e9a4ebe845f38`, em 2026-11-28 UTC, com Node `v22.23.4` e npm `10.9.9`. Este arquivo não entra nos testes nem no bundle.

Nenhum threshold de cobertura bloqueia o CI.

| Check | Comando | Exit | Resultado |
| --- | --- | --- | --- |
| lint | `npm run lint` | 0 | ESLint flat, `typescript-eslint` com typecheck e plugins React, sem erros |
| typecheck | `npm run typecheck` | 0 | `tsc --noEmit`, `strict: true` |
| test | `npm test` | 0 | 29 testes, 0 falhas |
| coverage | `npm run test:coverage` | 0 | Linhas 97,86% · ramos 88,12% · funções 100%. Sem threshold. `coverage/lcov.info` é artefato de CI |
| build | `npm run build` | 0 | Vite 8.4.0: `index.html` 0,72 kB (gzip 0,45 kB), CSS 1,24 kB (gzip 0,61 kB), JS 221,23 kB (gzip 69,40 kB). `dist/server.js` 6,5 kB |
| npm audit | `npm audit` | 0 | 0 vulnerabilidades |
| gitleaks | `gitleaks detect --log-opts=HEAD` (CLI 8.30.1) | 0 | Nenhum vazamento no histórico desta branch a partir de `01976565`. O CI confere o sha256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` do tarball linux_x64 |
| workspace-clean | `bash scripts/workspace-clean.sh` após `npm test` | 0 | `git status --porcelain` vazio e nenhum `data/` ou `*.db` ignorado |

## CI

Jobs em `.github/workflows/ci.yml`: `lint`, `typecheck`, `test` (cobertura como artefato), `build`, `workspace-clean`, `gitleaks`. Sem job de deploy. Permissão de workflow: `contents: read`. As actions estão pinadas por SHA de 40 hexas.

## Smoke local

- `NODE_ENV=production` em `127.0.0.1`: `GET /api/health` 200 e `GET /api/ready` 200 com a fixture sintética.
- `npm run dev` em `127.0.0.1:4180`: `/proc/net/tcp` mostra `0100007F:4180` e `0100007F:24678` (API e HMR em 127.0.0.1). Não há socket do HMR em `00000000`.
- Com o arquivo do banco removido, `GET /api/ready` responde 503 sem o caminho absoluto, e o arquivo não é recriado.
- `B360_AOC_HOST=0.0.0.0` encerra o processo antes do `listen`.
- Segundo `npm run db:seed` recusa sobrescrever. `--overwrite` grava e deixa `.bak`.
