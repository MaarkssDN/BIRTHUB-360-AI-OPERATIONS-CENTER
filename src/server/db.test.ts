import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mock, test } from 'node:test';
import { bindSyntheticDatabase } from '../../test/with-synthetic-db.ts';
import {
  DatabaseUnavailableError,
  loadDatabase,
  parseDatabaseState,
  resolveDbFilePath,
  saveDatabase,
  withDatabaseLock,
} from './db.ts';
import { seedDatabaseFromFixture } from './seed.ts';

const sandbox = bindSyntheticDatabase();
const FIXTURE = path.resolve('test/fixtures/b360-aoc-db.synthetic.json');

async function readFixtureState() {
  const raw = await fs.readFile(FIXTURE, 'utf8');
  return parseDatabaseState(raw);
}

test('resolveDbFilePath lê B360_AOC_DB_PATH a cada chamada', () => {
  const first = path.join(sandbox.dir(), 'um.json');
  const second = path.join(sandbox.dir(), 'dois.json');
  process.env.B360_AOC_DB_PATH = first;
  assert.equal(resolveDbFilePath(), path.resolve(first));
  process.env.B360_AOC_DB_PATH = second;
  assert.equal(resolveDbFilePath(), path.resolve(second));
  delete process.env.B360_AOC_DB_PATH;
  assert.equal(resolveDbFilePath(), path.resolve(process.cwd(), 'data', 'b360-aoc-db.json'));
});

test('loadDatabase lê a fixture copiada para o temporário', () => {
  const state = loadDatabase();
  assert.equal(state.seed, 'synthetic');
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.governance.devinBridgeEnabled, false);
  assert.equal(state.governance.devinContractVerified, false);
  assert.equal(state.missions[0]?.auditorAgentId, 'AG-SYN-AUD');
});

test('saveDatabase e loadDatabase resolvem o caminho de novo', () => {
  const state = loadDatabase();
  const mission = state.missions[0];
  assert.ok(mission);
  saveDatabase({
    ...state,
    governance: { ...state.governance, globalAutomationSuspended: false },
    missions: [{ ...mission, title: 'Missão alterada só no temporário' }],
  });
  const again = loadDatabase();
  assert.equal(again.governance.globalAutomationSuspended, false);
  assert.equal(again.missions[0]?.title, 'Missão alterada só no temporário');
  assert.equal(again.governance.devinBridgeEnabled, false);
});

test('a fixture sintética versionada não é alterada pelos testes', async () => {
  const before = await fs.readFile(FIXTURE);
  const state = loadDatabase();
  saveDatabase({
    ...state,
    governance: { ...state.governance, globalAutomationSuspended: false },
  });
  const after = await fs.readFile(FIXTURE);
  assert.deepEqual(before, after);
});

test('loadDatabase falha fechado se o caminho é um diretório', async () => {
  const filePath = sandbox.dbPath();
  await fs.rm(filePath);
  await fs.mkdir(filePath);
  assert.throws(() => loadDatabase(), /não é um arquivo regular/);
});

test('loadDatabase falha fechado se o arquivo não existe e não semeia', async () => {
  const filePath = sandbox.dbPath();
  await fs.rm(filePath);
  assert.throws(() => loadDatabase(), DatabaseUnavailableError);
  await assert.rejects(fs.access(filePath));
});

test('loadDatabase falha fechado se o diretório pai não existe', async () => {
  const missing = path.join(sandbox.dir(), 'ausente', 'b360-aoc-db.json');
  process.env.B360_AOC_DB_PATH = missing;
  assert.throws(() => loadDatabase(), /Diretório pai do banco não existe/);
  await assert.rejects(fs.access(path.dirname(missing)));
});

test('JSON inválido não é substituído por seed', async () => {
  const filePath = sandbox.dbPath();
  await fs.writeFile(filePath, '{', 'utf8');
  assert.throws(() => loadDatabase(), /JSON do banco inválido/);
  assert.equal(await fs.readFile(filePath, 'utf8'), '{');
});

test('saveDatabase não cria o diretório pai', async () => {
  const missing = path.join(sandbox.dir(), 'sem-pai', 'b360-aoc-db.json');
  process.env.B360_AOC_DB_PATH = missing;
  const state = await readFixtureState();
  assert.throws(() => saveDatabase(state), /nada foi criado/);
  await assert.rejects(fs.access(path.dirname(missing)));
});

test('o contrato recusa ponte habilitada', () => {
  const state = loadDatabase();
  const raw = JSON.stringify({
    ...state,
    governance: { ...state.governance, devinBridgeEnabled: true },
  });
  assert.throws(() => parseDatabaseState(raw), /rejeitado pelo contrato/);
});

test('o seed explícito grava a fixture sintética', () => {
  const target = path.join(sandbox.dir(), 'nested', 'b360-aoc-db.json');
  process.env.B360_AOC_DB_PATH = target;
  assert.throws(() => loadDatabase(), DatabaseUnavailableError);
  const relative = seedDatabaseFromFixture();
  assert.equal(relative, path.relative(process.cwd(), target));
  const state = loadDatabase();
  assert.equal(state.seed, 'synthetic');
  assert.equal(state.providers[0]?.id, 'IA-SYNTHETIC');
});

test('a fixture não contém e-mail, Drive nem segredo', async () => {
  const raw = await fs.readFile(FIXTURE, 'utf8');
  assert.equal(raw.includes('@'), false);
  assert.equal(/drive\.google\.com/i.test(raw), false);
  assert.equal(/gmail/i.test(raw), false);
  assert.equal(/secret/i.test(raw), false);
  assert.equal(/token/i.test(raw), false);
});

test('schema inválido falha fechado e não grava', async () => {
  const filePath = sandbox.dbPath();
  const samples = ['null', '{}', '[]', '42', '"x"', '{"providers":"oops"}'];
  for (const sample of samples) {
    await fs.writeFile(filePath, sample, 'utf8');
    assert.throws(() => loadDatabase(), /rejeitado pelo contrato/);
    assert.equal(await fs.readFile(filePath, 'utf8'), sample);
  }
  const names = await fs.readdir(sandbox.dir());
  assert.equal(names.some((name) => name.includes('.tmp')), false);
});

test('saveDatabase preserva o modo e arquivo novo fica em 0600', async () => {
  const filePath = sandbox.dbPath();
  await fs.chmod(filePath, 0o640);
  const state = loadDatabase();
  saveDatabase({
    ...state,
    governance: { ...state.governance, globalAutomationSuspended: false },
  });
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o640);
  await fs.rm(filePath);
  saveDatabase(state);
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});

test('symlink no banco não é seguido nem substituído', async () => {
  const filePath = sandbox.dbPath();
  const real = path.join(sandbox.dir(), 'real.json');
  await fs.rename(filePath, real);
  await fs.symlink(real, filePath);
  const before = await fs.readFile(real);
  assert.throws(() => loadDatabase(), /symlink/);
  const state = parseDatabaseState(before.toString('utf8'));
  assert.throws(() => saveDatabase(state), /symlink/);
  assert.equal((await fs.lstat(filePath)).isSymbolicLink(), true);
  assert.deepEqual(await fs.readFile(real), before);
  await fs.rm(filePath);
  await fs.symlink(path.join(sandbox.dir(), 'ausente.json'), filePath);
  assert.throws(() => loadDatabase(), /symlink/);
  assert.equal((await fs.lstat(filePath)).isSymbolicLink(), true);
});

test('diretório pai que é symlink é recusado', async () => {
  const linked = path.join(sandbox.dir(), 'via-link');
  await fs.symlink(sandbox.dir(), linked);
  process.env.B360_AOC_DB_PATH = path.join(linked, 'b360-aoc-db.json');
  assert.throws(() => loadDatabase(), /symlink/);
  assert.throws(() => saveDatabase(loadSafeFixture()), /symlink/);
});

test('saveDatabase faz fsync do temporário e do diretório', () => {
  let synced = 0;
  const original = fsSync.fsyncSync;
  mock.method(fsSync, 'fsyncSync', (fd: number) => {
    synced += 1;
    original(fd);
  });
  try {
    const state = loadDatabase();
    saveDatabase({
      ...state,
      governance: { ...state.governance, globalAutomationSuspended: false },
    });
  } finally {
    mock.restoreAll();
  }
  assert.ok(synced >= 3);
});

test('falha de escrita não altera o arquivo e não deixa temporário', async () => {
  const filePath = sandbox.dbPath();
  const before = await fs.readFile(filePath);
  const original = fsSync.openSync;
  mock.method(fsSync, 'openSync', (...args: Parameters<typeof fsSync.openSync>) => {
    if (String(args[0]).includes('.tmp')) {
      const error = new Error('sem espaço') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    }
    return original(...args);
  });
  try {
    const state = loadDatabase();
    assert.throws(
      () =>
        saveDatabase({
          ...state,
          governance: { ...state.governance, globalAutomationSuspended: false },
        }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EACCES',
    );
  } finally {
    mock.restoreAll();
  }
  assert.deepEqual(await fs.readFile(filePath), before);
  const names = await fs.readdir(sandbox.dir());
  assert.equal(names.some((name) => name.includes('.tmp')), false);
});

test('falha de rename não copia por cima e não deixa temporário', async () => {
  const filePath = sandbox.dbPath();
  const before = await fs.readFile(filePath);
  const original = fsSync.renameSync;
  mock.method(fsSync, 'renameSync', (from: fsSync.PathLike, to: fsSync.PathLike) => {
    if (String(from).includes('.tmp')) {
      const error = new Error('rename recusado') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    }
    original(from, to);
  });
  try {
    const state = loadDatabase();
    assert.throws(
      () =>
        saveDatabase({
          ...state,
          governance: { ...state.governance, globalAutomationSuspended: false },
        }),
      /rename recusado/,
    );
  } finally {
    mock.restoreAll();
  }
  assert.deepEqual(await fs.readFile(filePath), before);
  const names = await fs.readdir(sandbox.dir());
  assert.equal(names.some((name) => name.includes('.tmp')), false);
  assert.equal(names.filter((name) => name.endsWith('.json')).length, 1);
});

test('trava stale de pid morto é assumida', () => {
  const lockPath = `${sandbox.dbPath()}.lock`;
  fsSync.writeFileSync(
    lockPath,
    `${JSON.stringify({
      pid: deadPid(),
      nonce: 'stale',
      starttime: '1',
      acquiredAt: '2000-01-01T00:00:00.000Z',
    })}\n`,
  );
  const state = withDatabaseLock(() => loadDatabase(), { timeoutMs: 800 });
  assert.equal(state.seed, 'synthetic');
  assert.equal(fsSync.existsSync(lockPath), false);
});

test('trava viva não é roubada', () => {
  const filePath = sandbox.dbPath();
  const before = fsSync.readFileSync(filePath);
  const held = withDatabaseLock(() => {
    const child = spawnSync(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('test/db-lock-worker.ts')],
      {
        env: {
          ...process.env,
          B360_AOC_DB_PATH: filePath,
          B360_LOCK_MARKER: 'intruso',
          B360_LOCK_ROUNDS: '1',
          B360_LOCK_TIMEOUT_MS: '400',
        },
        encoding: 'utf8',
      },
    );
    return child;
  });
  assert.notEqual(held.status, 0);
  assert.match(held.stderr, /trava/);
  assert.deepEqual(fsSync.readFileSync(filePath), before);
});

test('processos concorrentes não perdem atualização sob a trava', { timeout: 20_000 }, async () => {
  const filePath = sandbox.dbPath();
  const rounds = 8;
  const markers = ['p0', 'p1', 'p2', 'p3'];
  const results = await Promise.all(
    markers.map((marker) => runLockWorker(filePath, marker, rounds)),
  );
  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
  }
  const title = loadDatabase().missions[0]?.title ?? '';
  const parts = title.split('|');
  assert.equal(parts[0], 'Missão sintética de scaffold');
  const counts = new Map<string, number>();
  for (const part of parts.slice(1)) {
    counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  for (const marker of markers) {
    assert.equal(counts.get(marker), rounds);
  }
  const names = await fs.readdir(sandbox.dir());
  assert.equal(names.some((name) => name.includes('.tmp') || name.endsWith('.lock')), false);
});

function loadSafeFixture(): ReturnType<typeof parseDatabaseState> {
  return parseDatabaseState(fsSync.readFileSync(FIXTURE, 'utf8'));
}

function deadPid(): number {
  for (let pid = 2_000_000; pid < 2_000_400; pid += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') {
        return pid;
      }
    }
  }
  throw new Error('nenhum pid livre para o teste de trava stale');
}

function runLockWorker(
  dbPath: string,
  marker: string,
  rounds: number,
): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('test/db-lock-worker.ts')],
      {
        env: {
          ...process.env,
          B360_AOC_DB_PATH: dbPath,
          B360_LOCK_MARKER: marker,
          B360_LOCK_ROUNDS: String(rounds),
          B360_LOCK_TIMEOUT_MS: '5000',
        },
      },
    );
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stderr });
    });
  });
}
