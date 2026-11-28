import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertLocalSqliteTarget, openLocalSqlite } from '../db/migrate.ts';
import { acquireFileLock, FileLockError } from '../server/fileLock.ts';

/**
 * Backup e restore locais de um arquivo SQLite.
 *
 * O restore publica um snapshot com temporário no mesmo diretório, `fsync`,
 * `rename` e `fsync` do diretório. Antes do `rename` confere `PRAGMA integrity_check`
 * e o hash de cada tabela. Operações exigem lock exclusivo nos dois arquivos.
 * Restore com conexão ativa é sempre recusado, sem opção de bypass.
 * URL, D1, wrangler, Cloudflare e symlink são recusados.
 */

export class SqliteBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqliteBackupError';
  }
}

export interface TableIntegrity {
  readonly name: string;
  readonly rowCount: number;
  readonly contentSha256: string;
}

export interface SqliteIntegrityReport {
  readonly integrityCheck: 'ok';
  readonly tables: readonly TableIntegrity[];
  readonly digestSha256: string;
}

export interface RestoreOptions {
  readonly overwriteInUse?: boolean;
}

export function measureSqliteIntegrity(filename: string): SqliteIntegrityReport {
  const resolved = localFile(filename);
  const stat = inspectFile(resolved, 'O arquivo SQLite');
  if (!stat) {
    throw new SqliteBackupError('Arquivo SQLite não existe.');
  }
  return readIntegrity(resolved);
}

export function backupSqlite(sourcePath: string, backupPath: string): SqliteIntegrityReport {
  const source = localFile(sourcePath);
  const destination = localFile(backupPath);
  assertDistinct(source, destination);
  if (!inspectFile(source, 'A origem do backup')) {
    throw new SqliteBackupError('Arquivo de origem não existe. Nada foi criado.');
  }
  assertParent(path.dirname(destination));
  if (inspectFile(destination, 'O destino do backup')) {
    throw new SqliteBackupError('O destino do backup já existe. Nada foi substituído.');
  }
  return withMaintenanceLocks(source, destination, () => {
    const report = readIntegrity(source);
    publishSnapshot(source, destination, false, report);
    return report;
  });
}

export function restoreSqlite(
  backupPath: string,
  targetPath: string,
  options: RestoreOptions = {},
): SqliteIntegrityReport {
  const backup = localFile(backupPath);
  const target = localFile(targetPath);
  assertDistinct(backup, target);
  if (!inspectFile(backup, 'O backup')) {
    throw new SqliteBackupError('Arquivo de backup não existe. Nada foi restaurado.');
  }
  assertParent(path.dirname(target));
  if (options.overwriteInUse === true) {
    throw new SqliteBackupError('Restore em banco em uso é proibido; opção de bypass recusada.');
  }
  return withMaintenanceLocks(backup, target, () => {
    const targetExists = inspectFile(target, 'O destino do restore') !== null;
    if (targetExists && databaseInUse(target)) {
      throw new SqliteBackupError('O banco de destino está em uso.');
    }
    for (const suffix of ['-wal', '-shm', '-journal']) {
      if (inspectFile(target + suffix, 'Arquivo auxiliar SQLite')) {
        throw new SqliteBackupError('Arquivo auxiliar SQLite presente; restore offline necessário.');
      }
    }
    const report = readIntegrity(backup);
    publishSnapshot(backup, target, true, report);
    return report;
  });
}

function publishSnapshot(
  source: string,
  destination: string,
  replace: boolean,
  expected: SqliteIntegrityReport,
): void {
  const parent = path.dirname(destination);
  const temporary = path.join(
    parent,
    `.${path.basename(destination)}.${process.pid}.${Date.now()}.restore.tmp`,
  );
  let published = false;
  try {
    const db = openLocalSqlite(source);
    try {
      try {
        db.exec(`VACUUM INTO ${sqlString(temporary)}`);
      } catch {
        throw new SqliteBackupError('Não foi possível gravar o snapshot SQLite.');
      }
    } finally {
      db.close();
    }
    fs.chmodSync(temporary, 0o600);
    fsyncFile(temporary);
    const actual = readIntegrity(temporary);
    if (!sameReport(actual, expected)) {
      throw new SqliteBackupError(
        'O snapshot não reproduz o hash da origem. O destino não foi substituído.',
      );
    }
    const existing = inspectFile(destination, 'O destino');
    if (existing && !replace) {
      throw new SqliteBackupError('O destino já existe. Nada foi substituído.');
    }
    fs.renameSync(temporary, destination);
    published = true;
    fsyncDirectory(parent);
  } catch (error) {
    if (!published) {
      fs.rmSync(temporary, { force: true });
    }
    throw error;
  }
}

function withMaintenanceLocks<T>(source: string, target: string, run: () => T): T {
  const releases: Array<() => void> = [];
  try {
    for (const filename of [source, target].sort()) {
      try {
        releases.push(acquireFileLock(filename + '.lock', { exclusive: true, timeoutMs: 100 }));
      } catch (error) {
        if (error instanceof FileLockError) throw new SqliteBackupError('Banco em uso ou trava inválida.');
        throw error;
      }
    }
    return run();
  } finally {
    for (const release of releases.reverse()) release();
  }
}

function databaseInUse(filename: string): boolean {
  let db: ReturnType<typeof openLocalSqlite> | undefined;
  try {
    db = openLocalSqlite(filename);
    db.exec('PRAGMA busy_timeout = 0;');
    db.exec('BEGIN IMMEDIATE');
    db.exec('ROLLBACK');
    return false;
  } catch (error) {
    if (isBusy(error)) {
      return true;
    }
    throw error;
  } finally {
    db?.close();
  }
}

function readIntegrity(filename: string): SqliteIntegrityReport {
  let db: ReturnType<typeof openLocalSqlite>;
  try {
    db = openLocalSqlite(filename);
  } catch {
    throw new SqliteBackupError('Não foi possível abrir o SQLite para verificar a integridade.');
  }
  try {
    let check: ReturnType<typeof db.prepare>;
    try {
      check = db.prepare('PRAGMA integrity_check');
    } catch {
      throw new SqliteBackupError('Não foi possível verificar a integridade do SQLite.');
    }
    let verdicts: string[];
    try {
      verdicts = check.all().map((row) => String(Object.values(row)[0]));
    } catch {
      throw new SqliteBackupError('Não foi possível verificar a integridade do SQLite.');
    }
    if (verdicts.length !== 1 || verdicts[0] !== 'ok') {
      throw new SqliteBackupError('integrity_check falhou.');
    }
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    const tables: TableIntegrity[] = [];
    const digest = crypto.createHash('sha256');
    for (const name of names) {
      const table = measureTable(db, name);
      tables.push(table);
      digest.update(`${table.name}\0${String(table.rowCount)}\0${table.contentSha256}\n`);
    }
    return {
      integrityCheck: 'ok',
      tables,
      digestSha256: digest.digest('hex'),
    };
  } finally {
    db.close();
  }
}

function measureTable(db: ReturnType<typeof openLocalSqlite>, name: string): TableIntegrity {
  const quoted = quoteIdent(name);
  const columns = db
    .prepare(`PRAGMA table_info(${quoted})`)
    .all()
    .map((row) => ({ cid: Number(row.cid), name: String(row.name) }))
    .sort((left, right) => left.cid - right.cid)
    .map((column) => column.name);
  if (columns.length === 0) {
    throw new SqliteBackupError(`A tabela ${name} não tem colunas.`);
  }
  const countRow = db.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get();
  const rowCount = Number(countRow?.n ?? 0);
  const selected = columns.map((column) => quoteIdent(column)).join(', ');
  const rows = db
    .prepare(`SELECT ${selected} FROM ${quoted} ORDER BY ${quoteIdent(columns[0] ?? 'rowid')}`)
    .all();
  const content = crypto.createHash('sha256');
  for (const row of rows) {
    content.update(columns.map((column) => canonical(row[column])).join('\x1f'));
    content.update('\n');
  }
  return {
    name,
    rowCount,
    contentSha256: content.digest('hex'),
  };
}

function sameReport(actual: SqliteIntegrityReport, expected: SqliteIntegrityReport): boolean {
  return actual.digestSha256 === expected.digestSha256 && actual.tables.length === expected.tables.length;
}

function localFile(filename: string): string {
  try {
    assertLocalSqliteTarget(filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'alvo recusado';
    throw new SqliteBackupError(message);
  }
  if (filename === ':memory:') {
    throw new SqliteBackupError('Backup e restore exigem um arquivo local. Memória é recusada.');
  }
  return path.resolve(filename);
}

function assertDistinct(source: string, destination: string): void {
  if (source === destination) {
    throw new SqliteBackupError('Origem e destino são o mesmo arquivo.');
  }
}

function inspectFile(filename: string, label: string): fs.Stats | null {
  try {
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) {
      throw new SqliteBackupError(
        `${label} é um symlink. Recusado sem seguir nem substituir.`,
      );
    }
    if (!stat.isFile()) {
      throw new SqliteBackupError(`${label} não é um arquivo regular.`);
    }
    return stat;
  } catch (error) {
    if (error instanceof SqliteBackupError) {
      throw error;
    }
    if (isErrno(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

function assertParent(directory: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      throw new SqliteBackupError('Diretório pai não existe. Nada foi criado.');
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new SqliteBackupError(
      'Diretório pai é um symlink. Recusado sem seguir nem substituir.',
    );
  }
  if (!stat.isDirectory()) {
    throw new SqliteBackupError('Diretório pai não é um diretório.');
  }
}

function fsyncFile(filename: string): void {
  const fd = fs.openSync(filename, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new SqliteBackupError(`Identificador SQL recusado: ${name}.`);
  }
  return `"${name}"`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`;
  }
  if (typeof value === 'number') {
    return `num:${Number.isFinite(value) ? String(value) : 'nan'}`;
  }
  if (typeof value === 'string') {
    return `str:${value}`;
  }
  if (value instanceof Uint8Array) {
    return `bytes:${Buffer.from(value).toString('hex')}`;
  }
  return `json:${JSON.stringify(value)}`;
}

function isBusy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /SQLITE_BUSY|database is locked/i.test(message);
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
