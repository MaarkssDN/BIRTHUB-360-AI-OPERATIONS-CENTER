# BIRTHUB 360 — AI Operations Center

Scaffold do repositório público. Sem dados reais, sem ponte local e sem deploy.

## Rodar

```bash
npm ci
npm run db:seed
npm run dev
```

O servidor sobe em `http://127.0.0.1:3000` e recusa bind fora de loopback. No modo dev, o WebSocket de HMR do Vite também fica em `127.0.0.1`. O banco é lido de `B360_AOC_DB_PATH` a cada chamada (padrão `data/b360-aoc-db.json`). Se o arquivo ou o diretório pai não existir, a carga falha fechada: não há seed automático. JSON que não cumpre o contrato (`null`, `{}`, `[]`, número ou tipos errados) também falha fechado e não grava.

A gravação usa o `fsync` do scaffold: temporário, `fsync`, `rename`, `fsync` do diretório. Se o `rename` falha, a operação aborta: não há cópia por cima do destino. O modo de um arquivo existente é preservado; arquivo novo fica em `0600`. Symlink no banco, no diretório pai ou no lock é recusado com `lstat` e `O_NOFOLLOW`, sem ser seguido e sem ser substituído.

A trava entre processos é o lockfile `<banco>.lock`, criado com `O_EXCL`. `withDatabaseLock` segura a trava durante um ciclo de leitura, modificação e gravação. `loadDatabase` e `saveDatabase` travam só a própria chamada. Pid morto ou reutilizado (`/proc`) torna a trava stale na hora; conteúdo ilegível só é stale após 5s. O tempo limite padrão é 5s. Não é trava de NFS. Entre a checagem do symlink e o `rename` resta uma janela curta.

`npm run db:seed` grava a fixture sintética `test/fixtures/b360-aoc-db.synthetic.json`. Se o arquivo já existir, o comando recusa sobrescrever. `npm run db:seed -- --overwrite` substitui o arquivo e guarda o conteúdo anterior em `data/b360-aoc-db.json.bak`.

## Schema relacional

As migrations locais criam **47 tabelas de domínio**. `migrations/0001_initial_schema.sql` cria 44. `migrations/0002_imported_conversations_outbox_event_log.sql` cria `ImportedConversations`, `Outbox` e `EventLog`. `schema_migrations` é só o controle do runner e não entra nas 47. Nenhuma tabela tem `tenant_id`. Não há `INSERT` de dados: o seed operacional continua sendo o comando JSON sintético.

```bash
npm run migrate:local
npm run migrate:local -- data/b360-aoc.sqlite
```

`npm run migrate:local` é idempotente, grava o SHA-256 de cada arquivo e pode rodar de novo sem reaplicar. Recusa URL, `d1:`, wrangler e Cloudflare. Não aplica migration remota. A reconstrução da `0001` está em `docs/schema-relacional.md`.

## Repositório

`MissionRepository` recebe `AuthContext` em toda chamada, sem default. O tipo mora em `src/auth/context.ts` (`viewer`, `operator`, `admin`). `requireAuth` não está neste repositório. Nenhum método aceita tenant fora do contexto. O adapter JSON grava só se a unidade de trabalho retorna. O adapter SQLite usa `BEGIN IMMEDIATE` e faz rollback se ela lança. `viewer` não grava. `TENANT_ISOLATION` continua `pending`: não há coluna `tenant_id` e o SQL não filtra por inquilino.

## Backup local

`backupSqlite` e `restoreSqlite` copiam um SQLite local. Os dois recusam URL, `d1:`, wrangler, Cloudflare e symlink, sem seguir nem substituir o link. O restore confere `PRAGMA integrity_check` e a contagem e o hash de cada tabela, inclusive `schema_migrations`. A publicação é temporário no mesmo diretório, `fsync`, `rename` e `fsync` do diretório. Um banco com trava viva só é substituído com `overwriteInUse: true`; a conexão já aberta permanece no inode antigo.

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
