import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { bindSyntheticDatabase } from '../../test/with-synthetic-db.ts';
import {
  DatabaseUnavailableError,
  loadDatabase,
  parseDatabaseState,
  resolveDbFilePath,
  saveDatabase,
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
  assert.throws(() => loadDatabase(), /Falha ao ler o banco/);
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
