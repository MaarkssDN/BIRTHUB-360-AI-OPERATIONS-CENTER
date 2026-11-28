import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseStateSchema, type DatabaseState } from '../shared/contracts.ts';
import { acquireFileLock, FileLockError, type FileLockOptions } from './fileLock.ts';

const DEFAULT_RELATIVE_PATH = path.join('data', 'b360-aoc-db.json');

export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

/** Lê `B360_AOC_DB_PATH` a cada chamada. Padrão: `data/b360-aoc-db.json`. */
export function resolveDbFilePath(): string {
  const configured = process.env.B360_AOC_DB_PATH;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(configured.trim());
  }
  return path.resolve(process.cwd(), DEFAULT_RELATIVE_PATH);
}

export function parseDatabaseState(raw: string): DatabaseState {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new DatabaseUnavailableError(
      'JSON do banco inválido. Carga fail-closed: o arquivo não foi substituído nem semeado.',
    );
  }
  const parsed = DatabaseStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new DatabaseUnavailableError(
      'Estado do banco rejeitado pelo contrato. Carga fail-closed: o arquivo não foi substituído nem semeado.',
    );
  }
  return parsed.data;
}

/**
 * Segura a trava do arquivo durante `fn`.
 * `loadDatabase` e `saveDatabase` travam só a própria chamada. Um ciclo
 * leitura-modificação-gravação entre processos precisa desta função por fora,
 * senão as duas chamadas soltas continuam podendo perder atualização.
 */
export function withDatabaseLock<T>(fn: () => T, options?: FileLockOptions): T {
  return lockAround('load', fn, options);
}

function lockAround<T>(purpose: 'load' | 'save', fn: () => T, options?: FileLockOptions): T {
  const filePath = resolveDbFilePath();
  assertParentDirectory(path.dirname(filePath), purpose);
  let release: () => void;
  try {
    release = acquireFileLock(`${filePath}.lock`, options);
  } catch (error) {
    if (error instanceof FileLockError) {
      throw new DatabaseUnavailableError(error.message);
    }
    throw error;
  }
  try {
    return fn();
  } finally {
    release();
  }
}

/**
 * Falha fechada. Se o arquivo ou o diretório pai não existir, lança erro
 * e não cria nem semeia nada. Symlink é recusado sem ser seguido.
 */
export function loadDatabase(): DatabaseState {
  return withDatabaseLock(() => {
    const filePath = resolveDbFilePath();
    assertParentDirectory(path.dirname(filePath), 'load');
    const described = describeTarget(filePath);
    if (described.kind === 'absent') {
      throw new DatabaseUnavailableError(
        'Arquivo do banco não existe. Carga fail-closed: nada foi semeado.',
      );
    }
    return parseDatabaseState(readRegularFile(filePath));
  });
}

/**
 * Grava no caminho resolvido nesta chamada. Não cria o diretório pai.
 * O temporário recebe `fsync` antes do `rename`, e o diretório recebe `fsync`
 * depois. Falha de `rename` aborta: não há cópia por cima do destino.
 * O modo de um arquivo regular existente é preservado. Arquivo novo fica em 0600.
 * Symlink não é seguido nem substituído.
 */
export function saveDatabase(state: DatabaseState): void {
  const parsed = DatabaseStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new DatabaseUnavailableError(
      'Estado rejeitado pelo contrato. Gravação abortada; o arquivo existente não foi alterado.',
    );
  }
  const payload = `${JSON.stringify(parsed.data, null, 2)}\n`;
  lockAround('save', () => {
    const filePath = resolveDbFilePath();
    assertParentDirectory(path.dirname(filePath), 'save');
    const described = describeTarget(filePath);
    const mode = described.kind === 'file' ? described.mode : 0o600;
    writeAtomicFile(filePath, payload, mode);
  });
}

function assertParentDirectory(parent: string, purpose: 'load' | 'save'): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(parent);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      if (purpose === 'save') {
        throw new DatabaseUnavailableError(
          'Diretório pai do banco não existe. Gravação abortada; nada foi criado.',
        );
      }
      throw new DatabaseUnavailableError(
        'Diretório pai do banco não existe. Carga fail-closed: nada foi semeado.',
      );
    }
    const detail = error instanceof Error ? error.message : 'stat falhou';
    throw new DatabaseUnavailableError(
      `Falha ao acessar o diretório pai do banco (${detail}).`,
    );
  }
  if (stat.isSymbolicLink()) {
    throw new DatabaseUnavailableError(
      'Diretório pai do banco é um symlink. Recusado sem seguir nem substituir.',
    );
  }
  if (!stat.isDirectory()) {
    throw new DatabaseUnavailableError('Diretório pai do banco não é um diretório.');
  }
}

function describeTarget(filePath: string): { kind: 'absent' } | { kind: 'file'; mode: number } {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      throw new DatabaseUnavailableError(
        'O caminho do banco é um symlink. Recusado sem seguir nem substituir.',
      );
    }
    if (!stat.isFile()) {
      throw new DatabaseUnavailableError('O caminho do banco não é um arquivo regular.');
    }
    return { kind: 'file', mode: stat.mode & 0o777 };
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      throw error;
    }
    if (isErrno(error, 'ENOENT')) {
      return { kind: 'absent' };
    }
    const detail = error instanceof Error ? error.message : 'stat falhou';
    throw new DatabaseUnavailableError(`Falha ao inspecionar o banco (${detail}).`);
  }
}

function readRegularFile(filePath: string): string {
  let fd: number;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    if (isErrno(error, 'ELOOP')) {
      throw new DatabaseUnavailableError(
        'O caminho do banco é um symlink. Recusado sem seguir nem substituir.',
      );
    }
    const detail = error instanceof Error ? error.message : 'leitura falhou';
    throw new DatabaseUnavailableError(
      `Falha ao ler o banco (${detail}). Carga fail-closed: nada foi semeado.`,
    );
  }
  try {
    return fs.readFileSync(fd, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'leitura falhou';
    throw new DatabaseUnavailableError(
      `Falha ao ler o banco (${detail}). Carga fail-closed: nada foi semeado.`,
    );
  } finally {
    fs.closeSync(fd);
  }
}

function writeAtomicFile(filePath: string, payload: string, mode: number): void {
  const parent = path.dirname(filePath);
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${String(process.pid)}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  let fd: number | undefined;
  let renamed = false;
  try {
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    fs.writeSync(fd, payload);
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    refuseSymlinkReplacement(filePath);
    fs.renameSync(temporary, filePath);
    renamed = true;
    fsyncDirectory(parent);
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // o fd pode já ter sido fechado
      }
    }
    if (!renamed) {
      fs.rmSync(temporary, { force: true });
    }
    throw error;
  }
}

function refuseSymlinkReplacement(filePath: string): void {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      throw new DatabaseUnavailableError(
        'O caminho do banco é um symlink. Recusado sem seguir nem substituir.',
      );
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      throw error;
    }
    if (isErrno(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(
    directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
