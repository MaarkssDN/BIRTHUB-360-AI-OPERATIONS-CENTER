import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AuthContextError, parseAuthContext } from '../auth/context.ts';
import { applyMigrations, openLocalSqlite } from '../db/migrate.ts';
import { bindSyntheticDatabase } from '../../test/with-synthetic-db.ts';
import { loadDatabase } from '../server/db.ts';
import { JsonMissionRepository } from './jsonMissionRepository.ts';
import { SqliteMissionRepository } from './sqliteMissionRepository.ts';
import { TENANT_ISOLATION } from './tenantExtension.ts';

const sandbox = bindSyntheticDatabase();
const MISSION_ID = 'MSN-SYNTHETIC-001';

const admin = {
  userId: 'user-synthetic',
  tenantId: 'tenant-a.example',
  role: 'admin' as const,
  sessionId: 'session-synthetic',
};

const operator = {
  ...admin,
  role: 'operator' as const,
  tenantId: 'tenant-b.example',
};

const viewer = {
  ...admin,
  role: 'viewer' as const,
};

test('parseAuthContext recusa contexto ausente e não lê tenant de outro campo', () => {
  assert.throws(() => parseAuthContext(undefined), AuthContextError);
  assert.throws(() => parseAuthContext(null), AuthContextError);
  assert.throws(() => parseAuthContext({}), AuthContextError);
  assert.throws(
    () =>
      parseAuthContext({
        userId: 'user-synthetic',
        tenantId: 'tenant-a.example',
        role: 'owner',
        sessionId: 'session-synthetic',
      }),
    AuthContextError,
  );
  const parsed = parseAuthContext({
    ...admin,
    tenantFromRequest: 'outro-tenant',
  });
  assert.equal(parsed.tenantId, admin.tenantId);
  assert.equal(TENANT_ISOLATION, 'pending');
});

test('o adapter JSON recusa chamada sem contexto e não grava o viewer', async () => {
  const repo = JsonMissionRepository.open();
  const filePath = sandbox.dbPath();
  const before = await fs.promises.readFile(filePath);
  try {
    assert.throws(
      () => repo.read(undefined as unknown as typeof admin, () => undefined),
      AuthContextError,
    );
    assert.throws(
      () => repo.write(viewer, (unitOfWork) => unitOfWork.setMissionTitle(MISSION_ID, 'não')),
      /viewer/,
    );
  } finally {
    repo.close();
  }
  assert.deepEqual(await fs.promises.readFile(filePath), before);
});

test('o adapter JSON desfaz a unidade de trabalho quando ela lança', () => {
  const repo = JsonMissionRepository.open();
  try {
    const before = repo.read(viewer, (unitOfWork) => unitOfWork.getMission(MISSION_ID)?.title);
    assert.throws(
      () =>
        repo.write(operator, (unitOfWork) => {
          unitOfWork.setMissionTitle(MISSION_ID, 'não deve persistir');
          throw new Error('falha sintética');
        }),
      /falha sintética/,
    );
    assert.equal(
      repo.read(admin, (unitOfWork) => unitOfWork.getMission(MISSION_ID)?.title),
      before,
    );
    repo.write(admin, (unitOfWork) => {
      unitOfWork.setMissionTitle(MISSION_ID, 'título confirmado');
    });
    assert.equal(loadDatabase().missions[0]?.title, 'título confirmado');
  } finally {
    repo.close();
  }
});

test('escritas JSON concorrentes não se perdem', { timeout: 20_000 }, async () => {
  const filePath = sandbox.dbPath();
  const rounds = 4;
  const markers = ['j0', 'j1'];
  const results = await Promise.all(markers.map((marker) => runJsonWorker(filePath, marker, rounds)));
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
});

test('o adapter SQLite faz rollback, serializa escritores e não filtra tenant', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-repo-'));
  const filename = path.join(dir, 'b360-aoc.sqlite');
  const setup = openLocalSqlite(filename);
  applyMigrations(setup);
  seedSyntheticMission(setup);
  setup.close();

  const repoA = SqliteMissionRepository.open(filename);
  const repoB = SqliteMissionRepository.open(filename);
  try {
    assert.throws(
      () => repoA.write(undefined as unknown as typeof admin, () => undefined),
      AuthContextError,
    );
    assert.throws(
      () => repoA.write(viewer, (unitOfWork) => unitOfWork.setMissionTitle(MISSION_ID, 'não')),
      /viewer/,
    );

    const columns = setupColumns(filename);
    assert.equal(columns.includes('tenant_id'), false);

    const seenByA = repoA.read(admin, (unitOfWork) => unitOfWork.getMission(MISSION_ID)?.title);
    const seenByB = repoB.read(operator, (unitOfWork) => unitOfWork.getMission(MISSION_ID)?.title);
    assert.equal(seenByA, 'Missão sintética de scaffold');
    assert.equal(seenByB, seenByA);

    assert.throws(
      () =>
        repoA.write(admin, (unitOfWork) => {
          unitOfWork.setMissionTitle(MISSION_ID, 'não deve persistir');
          throw new Error('falha sintética');
        }),
      /falha sintética/,
    );
    assert.equal(
      repoB.read(viewer, (unitOfWork) => unitOfWork.getMission(MISSION_ID)?.title),
      'Missão sintética de scaffold',
    );

    repoA.write(admin, (unitOfWork) => {
      unitOfWork.setMissionTitle(MISSION_ID, 'gravado pelo A');
      assert.throws(
        () => repoB.write(operator, (other) => other.setMissionTitle(MISSION_ID, 'gravado pelo B')),
        /locked|busy|SQLITE_BUSY/i,
      );
    });
    assert.equal(
      repoB.read(operator, (unitOfWork) => unitOfWork.getMission(MISSION_ID)?.title),
      'gravado pelo A',
    );
  } finally {
    repoA.close();
    repoB.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function setupColumns(filename: string): string[] {
  const db = openLocalSqlite(filename);
  try {
    return db.prepare('PRAGMA table_info(Missions)').all().map((row) => String(row.name));
  } finally {
    db.close();
  }
}

function seedSyntheticMission(db: ReturnType<typeof openLocalSqlite>): void {
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO Providers (
        id, name, environment, connection_status, role_description, capabilities_json, integration_notes
      ) VALUES ('IA-SYNTHETIC', 'Provedor sintético', 'fixture', 'DESLIGADO', 'somente teste', '[]', 'https://example.com/synthetic')`,
    ).run();
    db.prepare(
      `INSERT INTO Squads (
        id, name, environment, coordinator_agent_id, coordinator_provider_id, mission_scope, guardrails_json
      ) VALUES ('SQ-SYN', 'Squad sintética', 'fixture', 'AG-SYN-EXEC', 'IA-SYNTHETIC', 'teste', '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO Agents (
        id, agent_number, name, operational_persona, specialty, responsibilities_json,
        squad_id, coordinator_id, associated_provider_id, owned_modules_json,
        permanent_instructions, operational_state
      ) VALUES
        ('AG-SYN-EXEC', 90, 'Executor sintético', 'teste', 'teste', '[]', 'SQ-SYN', 'AG-SYN-EXEC', 'IA-SYNTHETIC', '[]', 'nenhuma', 'ATIVO'),
        ('AG-SYN-AUD', 91, 'Auditor sintético', 'teste', 'teste', '[]', 'SQ-SYN', 'AG-SYN-EXEC', 'IA-SYNTHETIC', '[]', 'nenhuma', 'ATIVO')`,
    ).run();
    db.prepare(
      `INSERT INTO Projects (id, code, name, repo_url, created_at)
       VALUES ('PRJ-SYN', 'SYN', 'Projeto sintético', 'https://example.com/synthetic/repo', '2026-11-27T00:00:00.000Z')`,
    ).run();
    db.prepare(
      `INSERT INTO Waves (
        id, wave_number, project_id, title, scope, status, dependencies_json,
        acceptance_criteria_json, risks_json, evidence_summary
      ) VALUES ('WAVE-SYN', 4, 'PRJ-SYN', 'Onda sintética', 'teste', 'ABERTA', '[]', '[]', '[]', 'nenhuma')`,
    ).run();
    db.prepare(
      `INSERT INTO Missions (
        id, code, project_id, wave_id, title, step_number, step_code, status,
        executor_provider_id, executor_agent_id, auditor_agent_id, priority,
        acceptance_criteria_json, preflight_json, created_at, updated_at
      ) VALUES (
        'MSN-SYNTHETIC-001', 'MSN-SYN-001', 'PRJ-SYN', 'WAVE-SYN', 'Missão sintética de scaffold',
        1, 'S01', 'ABERTA', 'IA-SYNTHETIC', 'AG-SYN-EXEC', 'AG-SYN-AUD', 'BAIXA',
        '[]', '[]', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'
      )`,
    ).run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function runJsonWorker(
  dbPath: string,
  marker: string,
  rounds: number,
): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('test/json-repo-worker.ts')],
      {
        env: {
          ...process.env,
          B360_AOC_DB_PATH: dbPath,
          B360_REPO_MARKER: marker,
          B360_REPO_ROUNDS: String(rounds),
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
