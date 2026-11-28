# BIRTHUB 360 — AI Operations Center

Scaffold do repositório público. Sem dados reais, sem ponte local e sem deploy.

## Rodar

```bash
npm ci
npm run db:seed
npm run dev
```

O servidor sobe em `http://127.0.0.1:3000` e recusa bind fora de loopback. No modo dev, o WebSocket de HMR do Vite também fica em `127.0.0.1`. O banco é lido de `B360_AOC_DB_PATH` a cada chamada (padrão `data/b360-aoc-db.json`). Se o arquivo ou o diretório pai não existir, a carga falha fechada: não há seed automático.

`npm run db:seed` grava a fixture sintética `test/fixtures/b360-aoc-db.synthetic.json`. Se o arquivo já existir, o comando recusa sobrescrever. `npm run db:seed -- --overwrite` substitui o arquivo e guarda o conteúdo anterior em `data/b360-aoc-db.json.bak`.

## Verificar

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm start
```

`data/`, `.env` e `*.db` ficam fora do Git. Variáveis de exemplo, só com placeholders, estão em `.env.example`.

## API

`GET /api/health` e `GET /api/ready` são públicas e não devolvem caminho de arquivo. O restante de `/api` exige sessão opaca (Bearer ou cookie `HttpOnly`) e um papel. O contrato, a matriz rota×papel e a interface `SessionStore` estão em `src/server/auth/README.md`. O bind e o HMR continuam em `127.0.0.1`.
