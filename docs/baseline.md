# Baseline medido — PR #1

Medido na árvore do commit `f1bffc564d1396d91e2f027390fcf22d144e8a41`, em 2026-11-28 UTC, com Node `v22.23.4` e npm `10.9.9`. Este arquivo não entra nos testes nem no bundle. Os comandos abaixo foram executados de novo depois que a documentação entrou na árvore; o resultado numérico é o da medição.

Nenhum threshold de cobertura bloqueia o CI.

| Check | Comando | Exit | Resultado |
| --- | --- | --- | --- |
| lint | `npm run lint` | 0 | ESLint flat, `typescript-eslint` com typecheck e plugins React, sem erros |
| typecheck | `npm run typecheck` | 0 | `tsc --noEmit`, `strict: true` |
| test | `npm test` | 0 | 24 testes, 0 falhas |
| coverage | `npm run test:coverage` | 0 | Linhas 96,93% · ramos 88,27% · funções 98,82%. Sem threshold. `coverage/lcov.info` é artefato de CI |
| build | `npm run build` | 0 | Vite 8.4.0: `index.html` 0,72 kB (gzip 0,45 kB), CSS 1,24 kB (gzip 0,61 kB), JS 221,23 kB (gzip 69,40 kB). `dist/server.js` 6,1 kB |
| npm audit | `npm audit` | 0 | 0 vulnerabilidades |
| gitleaks | `gitleaks detect --log-opts=HEAD` (CLI 8.30.1) | 0 | Nenhum vazamento no histórico desta branch a partir de `01976565` |
| workspace-clean | `git status --porcelain` após `npm test` | 0 | Saída vazia |

## CI

Jobs em `.github/workflows/ci.yml`: `lint`, `typecheck`, `test` (cobertura como artefato, passo `workspace-clean`), `build`, `workspace-clean`, `gitleaks`. Sem job de deploy.

O job `test` pede `actions: write` além de `contents: read` para publicar o artefato de cobertura. Os demais jobs ficam em `contents: read`.

ESLint está em 9.39.5 porque `eslint-plugin-react` 7.37.5 não declara peer de ESLint 10. O aviso de versão do ESLint 9 não quebra o lint.

## Smoke local

- `NODE_ENV=production` em `127.0.0.1:4173`: `GET /api/health` 200, `GET /api/ready` 200 com a fixture sintética, HTML do client servido.
- Chrome headless: a página mostra saúde operacional e persistência pronta; o botão Atualizar refaz a consulta.
- Com o arquivo do banco removido, `GET /api/ready` responde 503 e o arquivo não é recriado. A UI passa a "Fail-closed".
- `npm run dev` responde `GET /api/health` 200.
- `B360_AOC_HOST=0.0.0.0` encerra o processo antes do `listen` (exit 1).
