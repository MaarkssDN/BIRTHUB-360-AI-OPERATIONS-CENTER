import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Trava entre processos por lockfile (`O_CREAT|O_EXCL`).
 *
 * O pid morto (`ESRCH`) ou reutilizado (starttime de `/proc/<pid>/stat` diferente
 * do gravado) torna a trava stale na hora. Conteúdo ilegível só é stale depois
 * de `staleMs`, para não roubar um arquivo recém-criado ainda vazio.
 *
 * Limites: não é trava de NFS; o mesmo processo reentra sem novo `O_EXCL`;
 * um pid vivo sem starttime conferível não é roubado.
 */

const pauseSlot = new Int32Array(new SharedArrayBuffer(4));

type HeldLock = {
  depth: number;
  nonce: string;
};

const heldByPath = new Map<string, HeldLock>();

export type FileLockOptions = {
  timeoutMs?: number;
  staleMs?: number;
  /** Operação de manutenção não pode reentrar em conexão ativa neste processo. */
  exclusive?: boolean;
};

type LockRecord = {
  pid: number;
  nonce: string;
  starttime: string | null;
  acquiredAt: string;
};

export class FileLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileLockError';
  }
}

export type FileLockState = 'absent' | 'live' | 'stale' | 'symlink';

/** Lê a trava sem adquiri-la e sem seguir symlink. */
export function describeFileLock(lockPath: string, staleMs = 5_000): FileLockState {
  const resolved = path.resolve(lockPath);
  try {
    fs.lstatSync(resolved);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return 'absent';
    }
    throw error;
  }
  return inspectLock(resolved, staleMs);
}

export function acquireFileLock(lockPath: string, options: FileLockOptions = {}): () => void {
  const resolved = path.resolve(lockPath);
  const current = heldByPath.get(resolved);
  if (current) {
    if (options.exclusive) throw new FileLockError('Banco em uso neste processo.');
    current.depth += 1;
    return releaseOnce(resolved, current);
  }
  const nonce = createExclusive(resolved, options);
  const created: HeldLock = { depth: 1, nonce };
  heldByPath.set(resolved, created);
  return releaseOnce(resolved, created);
}

function releaseOnce(resolved: string, state: HeldLock): () => void {
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    state.depth -= 1;
    if (state.depth > 0) {
      return;
    }
    heldByPath.delete(resolved);
    releaseExclusive(resolved, state.nonce);
  };
}

function createExclusive(lockPath: string, options: FileLockOptions): string {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const staleMs = options.staleMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${JSON.stringify({
    pid: process.pid,
    nonce,
    starttime: readStartTime(process.pid),
    acquiredAt: new Date().toISOString(),
  })}\n`;

  // Serialize creation AND stale recovery. A second contender cannot unlink
  // the newly created lock based on a stale observation of its predecessor.
  // A crashed gate is intentionally NOT reclaimed automatically: fail closed.
  const gate = `${lockPath}.gate`;
  for (;;) {
    let entered = false;
    try {
      fs.mkdirSync(gate, { mode: 0o700 });
      entered = true;
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error;
      try {
        const stat = fs.lstatSync(gate);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw new FileLockError('Gate da trava inválido ou symlink.');
        }
      } catch (inspectionError) {
        if (!isErrno(inspectionError, 'ENOENT')) throw inspectionError;
      }
    }
    if (entered) {
      try {
        const inspection = inspectLock(lockPath, staleMs);
        if (inspection === 'symlink') {
          throw new FileLockError('O lock do banco é um symlink. Recusado sem seguir nem substituir.');
        }
        if (inspection === 'stale') {
          try {
            fs.unlinkSync(lockPath);
          } catch (error) {
            if (!isErrno(error, 'ENOENT')) throw error;
          }
        }
        if (inspection === 'absent' || inspection === 'stale') {
          const fd = fs.openSync(
            lockPath,
            fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
            0o600,
          );
          try {
            fs.writeFileSync(fd, payload);
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
          return nonce;
        }
      } finally {
        fs.rmdirSync(gate);
      }
    }
    if (Date.now() >= deadline) {
      throw new FileLockError('Não foi possível obter a trava do banco antes do tempo limite.');
    }
    Atomics.wait(pauseSlot, 0, 0, 20);
  }
}

function releaseExclusive(lockPath: string, nonce: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(lockPath);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new FileLockError(
      'O lock do banco é um symlink. Recusado sem seguir nem substituir.',
    );
  }
  const record = readLockRecord(lockPath);
  if (record?.nonce !== nonce) {
    return;
  }
  fs.unlinkSync(lockPath);
}

function inspectLock(lockPath: string, staleMs: number): FileLockState {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(lockPath);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      return 'absent';
    }
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return 'symlink';
  }
  const record = readLockRecord(lockPath);
  if (!record) {
    return Date.now() - stat.mtimeMs >= staleMs ? 'stale' : 'live';
  }
  return holderAlive(record) ? 'live' : 'stale';
}

function readLockRecord(lockPath: string): LockRecord | null {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    if (isErrno(error, 'ELOOP') || isErrno(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
  try {
    const buffer = Buffer.alloc(1024);
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return parseLockRecord(buffer.subarray(0, count).toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function parseLockRecord(raw: string): LockRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const pid = record.pid;
    const nonce = record.nonce;
    const starttime = record.starttime;
    const acquiredAt = record.acquiredAt;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      return null;
    }
    if (typeof nonce !== 'string' || nonce.length === 0) {
      return null;
    }
    if (starttime !== null && typeof starttime !== 'string') {
      return null;
    }
    if (typeof acquiredAt !== 'string') {
      return null;
    }
    return { pid, nonce, starttime, acquiredAt };
  } catch {
    return null;
  }
}

function holderAlive(record: LockRecord): boolean {
  try {
    process.kill(record.pid, 0);
  } catch (error) {
    return !isErrno(error, 'ESRCH');
  }
  if (record.starttime === null) {
    return true;
  }
  const current = readStartTime(record.pid);
  if (current === null) {
    return true;
  }
  return current === record.starttime;
}

function readStartTime(pid: number): string | null {
  if (process.platform !== 'linux') {
    return null;
  }
  try {
    const stat = fs.readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    if (close < 0) {
      return null;
    }
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
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
