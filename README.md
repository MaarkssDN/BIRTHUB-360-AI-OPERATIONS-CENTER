# BIRTHUB 360 — AI Operations Center

Scaffold do repositório público. Sem dados reais, sem ponte local e sem deploy.

## Rodar

```bash
npm ci
npm run db:seed
npm run dev
```

O servidor sobe em `http://127.0.0.1:3000` e recusa bind fora de loopback. O banco é lido de `B360_AOC_DB_PATH` a cada chamada (padrão `data/b360-aoc-db.json`). Se o arquivo ou o diretório pai não existir, a carga falha fechada: não há seed automático. JSON que não cumpre o contrato (`null`, `{}`, `[]`, número ou tipos errados) também falha fechado e não grava.

A gravação cria um temporário no mesmo diretório, faz `fsync`, troca com `rename` e faz `fsync` do diretório. Se o `rename` falha, a operação aborta: não há cópia por cima do destino. O modo de um arquivo existente é preservado; arquivo novo fica em `0600`. Symlink no banco, no diretório pai ou no lock é recusado com `lstat` e `O_NOFOLLOW`, sem ser seguido e sem ser substituído.

A trava entre processos é o lockfile `<banco>.lock`, criado com `O_EXCL`. `withDatabaseLock` segura a trava durante um ciclo de leitura, modificação e gravação. `loadDatabase` e `saveDatabase` travam só a própria chamada. Pid morto ou reutilizado (`/proc`) torna a trava stale na hora; conteúdo ilegível só é stale após 5s. O tempo limite padrão é 5s. Não é trava de NFS. Entre a checagem do symlink e o `rename` resta uma janela curta.

`npm run db:seed` grava a fixture sintética `test/fixtures/b360-aoc-db.synthetic.json`.

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
