import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyMigrations,
  DEFAULT_MIGRATIONS_DIR,
  listUserTables,
  openLocalSqlite,
  SCHEMA_MIGRATIONS_TABLE,
} from './migrate.ts';
import {
  RELATIONAL_TABLE_COUNT,
  RELATIONAL_TABLES,
  TABLES_INTRODUCED_BY_0001,
  TABLES_INTRODUCED_BY_0002,
} from './relationalCatalog.ts';

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function createTableNames(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi)].map(
    (match) => match[1] ?? '',
  );
}

function countOf(db: ReturnType<typeof openLocalSqlite>, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
  return Number(row?.n ?? 0);
}

function columnNames(db: ReturnType<typeof openLocalSqlite>, table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
}

test('0001 cria 44 tabelas e a 0002 acrescenta ImportedConversations, Outbox e EventLog', () => {
  const initialSql = fs.readFileSync(path.join(DEFAULT_MIGRATIONS_DIR, '0001_initial_schema.sql'), 'utf8');
  const addedSql = fs.readFileSync(
    path.join(DEFAULT_MIGRATIONS_DIR, '0002_imported_conversations_outbox_event_log.sql'),
    'utf8',
  );

  assert.deepEqual(createTableNames(initialSql), [...TABLES_INTRODUCED_BY_0001]);
  assert.equal(createTableNames(initialSql).length, 44);
  assert.deepEqual(createTableNames(addedSql), [...TABLES_INTRODUCED_BY_0002]);
  const ddl = stripSqlComments(`${initialSql}\n${addedSql}`);
  assert.equal(createTableNames(initialSql).includes('ImportedConversations'), false);
  assert.equal(ddl.includes('tenant_id'), false);
  assert.equal(ddl.includes('@'), false);
  assert.equal(/drive\.google/i.test(ddl), false);
  assert.equal(RELATIONAL_TABLE_COUNT, 47);
  assert.deepEqual(
    [...TABLES_INTRODUCED_BY_0001, ...TABLES_INTRODUCED_BY_0002],
    [...RELATIONAL_TABLES],
  );
});

test('applyMigrations materializa 47 tabelas, a unicidade da Outbox e o EventLog imutável', () => {
  const db = openLocalSqlite(':memory:');
  try {
    const first = applyMigrations(db);
    assert.deepEqual(
      first.applied.map((record) => record.filename),
      ['0001_initial_schema.sql', '0002_imported_conversations_outbox_event_log.sql', '0003_missions_tenant_scope.sql'],
    );
    assert.deepEqual(first.skipped, []);
    assert.equal(first.domainTables.length, 47);
    assert.deepEqual([...first.domainTables].sort(), [...RELATIONAL_TABLES].sort());
    assert.deepEqual(
      listUserTables(db).sort(),
      [...RELATIONAL_TABLES, SCHEMA_MIGRATIONS_TABLE].sort(),
    );
    assert.equal(countOf(db, SCHEMA_MIGRATIONS_TABLE), 2);

    for (const table of RELATIONAL_TABLES) {
      assert.equal(columnNames(db, table).includes('tenant_id'), false, table);
    }

    const pendingIndex = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_outbox_pending_dispatch'")
      .get();
    assert.match(String(pendingIndex?.sql), /status = 'PENDENTE'/);

    db.prepare(
      `INSERT INTO ImportedConversations (
        id, file_name, source_folder_url, content_fingerprint, imported_at, raw_text_preserved,
        participants_identified_json, chronology_entries_json, decisions_extracted_json,
        completed_work_json, pending_work_json, blockers_identified_json, contradictions_detected_json,
        authorization_requests_json, branches_and_commits_json, evidences_referenced_json,
        diagnostic_summary, proposed_waves_json, generated_prompts_json, generated_checklist_items_json
      ) VALUES (
        'IMP-SYN-1', 'nota.md', 'https://example.com/synthetic/folder', 'fnv1a-00000001',
        '2026-11-27T00:00:00.000Z', 'texto sintético',
        '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]',
        'resumo', '[]', '[]', '[]'
      )`,
    ).run();
    assert.throws(() => {
      db.prepare(
        `INSERT INTO ImportedConversations (
          id, file_name, source_folder_url, content_fingerprint, imported_at, raw_text_preserved,
          participants_identified_json, chronology_entries_json, decisions_extracted_json,
          completed_work_json, pending_work_json, blockers_identified_json, contradictions_detected_json,
          authorization_requests_json, branches_and_commits_json, evidences_referenced_json,
          diagnostic_summary, proposed_waves_json, generated_prompts_json, generated_checklist_items_json
        ) VALUES (
          'IMP-SYN-2', 'outra.md', 'https://example.com/synthetic/folder', 'fnv1a-00000001',
          '2026-11-27T00:00:01.000Z', 'texto sintético',
          '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]',
          'resumo', '[]', '[]', '[]'
        )`,
      ).run();
    });

    db.prepare(
      `INSERT INTO Outbox (
        id, idempotency_key, event_type, payload_json, status, attempt_count,
        available_at, created_at, updated_at
      ) VALUES ('OB-SYN-1', 'key-1', 'MISSION_DISPATCH', '{}', 'PENDENTE', 0, '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z')`,
    ).run();
    assert.throws(() => {
      db.prepare(
        `INSERT INTO Outbox (
          id, idempotency_key, event_type, payload_json, status, attempt_count,
          available_at, created_at, updated_at
        ) VALUES ('OB-SYN-2', 'key-1', 'MISSION_DISPATCH', '{}', 'PENDENTE', 1, '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z')`,
      ).run();
    });

    db.prepare(
      `INSERT INTO EventLog (
        id, sequence_no, entity_type, entity_id, correlation_id, event_type, payload_json, occurred_at, recorded_at
      ) VALUES
        ('EV-SYN-2', 2, 'Outbox', 'OB-SYN-1', 'corr-synthetic', 'SECOND', '{}', '2026-11-27T00:00:02.000Z', '2026-11-27T00:00:02.000Z'),
        ('EV-SYN-1', 1, 'Outbox', 'OB-SYN-1', 'corr-synthetic', 'FIRST', '{}', '2026-11-27T00:00:01.000Z', '2026-11-27T00:00:01.000Z')`,
    ).run();
    const ordered = db.prepare('SELECT event_type FROM EventLog ORDER BY sequence_no').all();
    assert.deepEqual(
      ordered.map((row) => String(row.event_type)),
      ['FIRST', 'SECOND'],
    );
    assert.throws(() => db.exec("UPDATE EventLog SET event_type = 'MUTATED' WHERE id = 'EV-SYN-1'"), /append-only/);
    assert.throws(() => db.exec("DELETE FROM EventLog WHERE id = 'EV-SYN-1'"), /append-only/);
    assert.equal(countOf(db, 'EventLog'), 2);
  } finally {
    db.close();
  }
});

test('a segunda aplicação não muda o schema', () => {
  const db = openLocalSqlite(':memory:');
  try {
    applyMigrations(db);
    const before = {
      migrations: countOf(db, SCHEMA_MIGRATIONS_TABLE),
      tables: listUserTables(db),
    };
    const second = applyMigrations(db);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(
      second.skipped.map((record) => record.version),
      ['0001', '0002', '0003'],
    );
    assert.equal(countOf(db, SCHEMA_MIGRATIONS_TABLE), before.migrations);
    assert.deepEqual(listUserTables(db), before.tables);

    db.prepare(`UPDATE ${SCHEMA_MIGRATIONS_TABLE} SET checksum = 'alterado' WHERE version = '0002'`).run();
    assert.throws(() => applyMigrations(db), /0002/);
  } finally {
    db.close();
  }
});

test('um arquivo SQLite temporário aceita duas execuções do runner', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-migrate-'));
  const filename = path.join(dir, 'b360-aoc.sqlite');
  try {
    const firstDb = openLocalSqlite(filename);
    const first = applyMigrations(firstDb);
    firstDb.close();

    const secondDb = openLocalSqlite(filename);
    const second = applyMigrations(secondDb);
    assert.deepEqual(second.applied, []);
    assert.equal(second.skipped.length, 3);
    assert.deepEqual([...second.domainTables].sort(), [...first.domainTables].sort());
    assert.equal(countOf(secondDb, SCHEMA_MIGRATIONS_TABLE), 2);
    secondDb.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('openLocalSqlite recusa alvo remoto', () => {
  assert.throws(() => openLocalSqlite('https://example.com/b360.sqlite'), /somente local/);
  assert.throws(() => openLocalSqlite('d1://example'), /somente local/);
  assert.throws(() => openLocalSqlite('wrangler d1 migrations apply'), /somente local/);
  const db = openLocalSqlite(':memory:');
  db.close();
});

test('versão duplicada no diretório de migrations é recusada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-dup-'));
  try {
    fs.copyFileSync(
      path.join(DEFAULT_MIGRATIONS_DIR, '0001_initial_schema.sql'),
      path.join(dir, '0001_initial_schema.sql'),
    );
    fs.writeFileSync(path.join(dir, '0001_outra.sql'), 'SELECT 1;\n');
    const db = openLocalSqlite(':memory:');
    try {
      assert.throws(() => applyMigrations(db, dir), /0001/);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrate:local lista 47 tabelas e recusa URL', () => {
  const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
  const script = path.resolve('scripts/migrate-local.ts');
  const ok = spawnSync(process.execPath, [tsx, script], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const summary = JSON.parse(ok.stdout) as { domainTableCount: number; applied: string[] };
  assert.equal(summary.domainTableCount, 47);
  assert.deepEqual(summary.applied, [
    '0001_initial_schema.sql',
    '0002_imported_conversations_outbox_event_log.sql',
    '0003_missions_tenant_scope.sql',
  ]);

  const remote = spawnSync(process.execPath, [tsx, script, 'https://example.com/b360.sqlite'], {
    encoding: 'utf8',
  });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /somente local/);
});
