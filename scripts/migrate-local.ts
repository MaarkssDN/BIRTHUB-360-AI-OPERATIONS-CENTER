import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, assertLocalSqliteTarget, openLocalSqlite } from '../src/db/migrate.ts';

/**
 * Aplica as migrations num SQLite local.
 * Sem argumentos, usa memória e só imprime o resumo.
 * Com um caminho de arquivo, grava nesse arquivo e pode ser repetido.
 * Não aceita URL, D1, wrangler nem Cloudflare.
 */
const targetArgument = process.argv[2] ?? ':memory:';

let db: DatabaseSync | undefined;
try {
  assertLocalSqliteTarget(targetArgument);
  const filename = targetArgument === ':memory:' ? ':memory:' : path.resolve(targetArgument);
  db = openLocalSqlite(filename);
  const result = applyMigrations(db);
  console.log(
    JSON.stringify(
      {
        target: filename,
        applied: result.applied.map((record) => record.filename),
        skipped: result.skipped.map((record) => record.filename),
        domainTableCount: result.domainTables.length,
        domainTables: result.domainTables,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'falha ao migrar';
  console.error(message);
  process.exitCode = 1;
} finally {
  db?.close();
}
