import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyMigrations, openLocalSqlite } from '../db/migrate.ts';
import { SqliteMissionRepository } from './sqliteMissionRepository.ts';
import {
  backupSqlite,
  measureSqliteIntegrity,
  restoreSqlite,
  SqliteBackupError,
} from './sqliteBackup.ts';

test('backup e restore locais fazem round-trip com integridade por tabela', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-backup-'));
  const source = path.join(dir, 'source.sqlite');
  const backup = path.join(dir, 'backup.sqlite');
  const restored = path.join(dir, 'restored.sqlite');
  try {
    const db = openLocalSqlite(source);
    applyMigrations(db);
    insertSyntheticOutbox(db, 'PENDENTE');
    db.close();

    const report = backupSqlite(source, backup);
    assert.equal(report.integrityCheck, 'ok');
    assert.equal(report.tables.length, 48);
    const outbox = report.tables.find((table) => table.name === 'Outbox');
    assert.ok(outbox);
    assert.equal(outbox.rowCount, 1);
    assert.equal(outbox.contentSha256.length, 64);
    assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
    assert.deepEqual(measureSqliteIntegrity(backup).tables, report.tables);

    const live = openLocalSqlite(source);
    live.prepare("UPDATE Outbox SET status = 'DESPACHADO' WHERE id = 'OB-BAK-1'").run();
    live.close();
    assert.notEqual(measureSqliteIntegrity(source).digestSha256, report.digestSha256);

    const copied = restoreSqlite(backup, restored);
    assert.equal(copied.digestSha256, report.digestSha256);
    assert.deepEqual(measureSqliteIntegrity(restored).tables, report.tables);
    assert.equal(outboxStatus(restored), 'PENDENTE');

    restoreSqlite(backup, source);
    assert.equal(measureSqliteIntegrity(source).digestSha256, report.digestSha256);
    assert.equal(outboxStatus(source), 'PENDENTE');
    assert.deepEqual(leftoverTemps(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore recusa banco em uso inclusive com flag legada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-backup-use-'));
  const target = path.join(dir, 'live.sqlite');
  const backup = path.join(dir, 'backup.sqlite');
  try {
    const db = openLocalSqlite(target);
    applyMigrations(db);
    insertSyntheticOutbox(db, 'PENDENTE');
    db.close();
    const report = backupSqlite(target, backup);
    const live = openLocalSqlite(target);
    live.prepare("UPDATE Outbox SET status = 'DESPACHADO' WHERE id = 'OB-BAK-1'").run();
    live.close();
    const before = fs.readFileSync(target);

    const repo = SqliteMissionRepository.open(target);
    try {
      assert.throws(() => restoreSqlite(backup, target), /em uso/);
      assert.deepEqual(fs.readFileSync(target), before);
      assert.equal(outboxStatus(target), 'DESPACHADO');
      assert.throws(() => restoreSqlite(backup, target, { overwriteInUse: true }), /em uso/);
      assert.deepEqual(fs.readFileSync(target), before);
    } finally {
      repo.close();
    }
    assert.equal(outboxStatus(target), 'DESPACHADO');
    restoreSqlite(backup, target);
    assert.equal(measureSqliteIntegrity(target).digestSha256, report.digestSha256);
    assert.equal(outboxStatus(target), 'PENDENTE');
    assert.deepEqual(leftoverTemps(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backup e restore recusam caminho ausente, symlink e alvo remoto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-backup-neg-'));
  const source = path.join(dir, 'source.sqlite');
  const backup = path.join(dir, 'backup.sqlite');
  const link = path.join(dir, 'link.sqlite');
  try {
    const db = openLocalSqlite(source);
    applyMigrations(db);
    insertSyntheticOutbox(db, 'PENDENTE');
    db.close();
    backupSqlite(source, backup);
    const original = fs.readFileSync(source);
    fs.symlinkSync(source, link);

    assert.throws(() => backupSqlite(path.join(dir, 'ausente.sqlite'), path.join(dir, 'novo.sqlite')), SqliteBackupError);
    assert.equal(fs.existsSync(path.join(dir, 'novo.sqlite')), false);
    assert.throws(() => restoreSqlite(path.join(dir, 'ausente.sqlite'), path.join(dir, 'outro.sqlite')), SqliteBackupError);
    assert.equal(fs.existsSync(path.join(dir, 'outro.sqlite')), false);
    assert.throws(
      () => restoreSqlite(backup, path.join(dir, 'sem-pai', 'alvo.sqlite')),
      /Diretório pai não existe/,
    );
    assert.equal(fs.existsSync(path.join(dir, 'sem-pai')), false);

    assert.throws(() => backupSqlite(link, path.join(dir, 'via-link.sqlite')), /symlink/);
    assert.equal(fs.existsSync(path.join(dir, 'via-link.sqlite')), false);
    assert.throws(() => restoreSqlite(backup, link), /symlink/);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.deepEqual(fs.readFileSync(source), original);

    assert.throws(() => backupSqlite('https://example.com/synthetic.sqlite', backup), /somente local/);
    assert.throws(() => restoreSqlite(backup, 'd1://example'), /somente local/);
    assert.throws(() => restoreSqlite('wrangler d1 apply', source), /somente local/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restore de backup corrompido não altera o destino', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b360-aoc-backup-bad-'));
  const source = path.join(dir, 'source.sqlite');
  const backup = path.join(dir, 'backup.sqlite');
  const corrupt = path.join(dir, 'corrupt.sqlite');
  try {
    const db = openLocalSqlite(source);
    applyMigrations(db);
    insertSyntheticOutbox(db, 'PENDENTE');
    db.close();
    backupSqlite(source, backup);
    const bytes = fs.readFileSync(backup);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    fs.writeFileSync(corrupt, bytes);
    const before = fs.readFileSync(source);
    assert.throws(() => restoreSqlite(corrupt, source), SqliteBackupError);
    assert.deepEqual(fs.readFileSync(source), before);
    assert.equal(outboxStatus(source), 'PENDENTE');
    assert.deepEqual(leftoverTemps(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function insertSyntheticOutbox(db: ReturnType<typeof openLocalSqlite>, status: string): void {
  db.prepare(
    `INSERT INTO Outbox (
      id, idempotency_key, event_type, payload_json, status, attempt_count,
      available_at, created_at, updated_at
    ) VALUES (
      'OB-BAK-1', 'key-bak', 'MISSION_DISPATCH',
      '{"url":"https://example.com/synthetic/backup"}',
      ?, 0, '2026-11-28T00:00:00.000Z', '2026-11-28T00:00:00.000Z', '2026-11-28T00:00:00.000Z'
    )`,
  ).run(status);
}

function outboxStatus(filename: string): string {
  const db = openLocalSqlite(filename);
  try {
    const row = db.prepare("SELECT status FROM Outbox WHERE id = 'OB-BAK-1'").get();
    return String(row?.status ?? '');
  } finally {
    db.close();
  }
}

function leftoverTemps(directory: string): string[] {
  return fs.readdirSync(directory).filter((name) => name.includes('.tmp'));
}
