import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/**
 * Runner local e idempotente das migrations SQL.
 *
 * Aplica migrations/0001..N, em ordem numérica, num SQLite aberto pelo
 * chamador (memória ou arquivo). Registra cada arquivo em schema_migrations
 * com SHA-256. Uma segunda execução com o mesmo conteúdo não reexecuta o SQL.
 * Se o arquivo mudou depois de aplicado, o runner falha em vez de reaplicar.
 *
 * Cada arquivo e o registro correspondente entram na mesma transação.
 * O driver é node:sqlite (Node.js 22). Este módulo não chama wrangler e
 * recusa URL, D1 e alvo Cloudflare.
 */

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';
export const DEFAULT_MIGRATIONS_DIR = path.resolve(MODULE_DIR, '../../migrations');

const MIGRATION_FILENAME = /^(\d{4})_.+\.sql$/;
const REMOTE_TARGET = /wrangler|cloudflare|d1:/i;

export interface AppliedMigration {
  version: string;
  filename: string;
  checksum: string;
  appliedAt: string;
}

export interface ApplyMigrationsResult {
  applied: AppliedMigration[];
  skipped: AppliedMigration[];
  domainTables: string[];
}

export function assertLocalSqliteTarget(filename: string): void {
  if (filename === ':memory:') {
    return;
  }
  if (
    filename.trim() === '' ||
    filename.includes('://') ||
    REMOTE_TARGET.test(filename) ||
    /^[a-z][a-z0-9+.-]*:/i.test(filename)
  ) {
    throw new Error(
      'O runner de migrations é somente local. Recusado um alvo com URL, D1, wrangler ou Cloudflare.',
    );
  }
}

export function openLocalSqlite(filename: string): DatabaseSync {
  assertLocalSqliteTarget(filename);
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

export function applyMigrations(
  db: DatabaseSync,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): ApplyMigrationsResult {
  ensureControlTable(db);
  const files = listMigrationFiles(migrationsDir);
  const applied: AppliedMigration[] = [];
  const skipped: AppliedMigration[] = [];

  for (const filename of files) {
    const version = migrationVersion(filename);
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const checksum = sha256(sql);
    const existing = readApplied(db, version);

    if (existing) {
      if (existing.filename !== filename || existing.checksum !== checksum) {
        throw new Error(
          `A migration ${version} já foi aplicada como ${existing.filename} com outro conteúdo. O runner não reescreve migrations aplicadas.`,
        );
      }
      skipped.push(existing);
      continue;
    }

    const record: AppliedMigration = {
      version,
      filename,
      checksum,
      appliedAt: new Date().toISOString(),
    };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare(
        `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)`,
      ).run(record.version, record.filename, record.checksum, record.appliedAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    applied.push(record);
  }

  return {
    applied,
    skipped,
    domainTables: listDomainTables(db),
  };
}

export function listUserTables(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return rows.map((row) => String(row.name));
}

export function listDomainTables(db: DatabaseSync): string[] {
  return listUserTables(db).filter((name) => name !== SCHEMA_MIGRATIONS_TABLE);
}

function ensureControlTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function listMigrationFiles(migrationsDir: string): string[] {
  const filenames = fs
    .readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILENAME.test(name))
    .sort(
      (left, right) =>
        migrationVersion(left).localeCompare(migrationVersion(right)) || left.localeCompare(right),
    );

  const seen = new Set<string>();
  for (const filename of filenames) {
    const version = migrationVersion(filename);
    if (seen.has(version)) {
      throw new Error(`Há duas migrations com a versão ${version} em ${migrationsDir}.`);
    }
    seen.add(version);
  }
  return filenames;
}

function migrationVersion(filename: string): string {
  const match = MIGRATION_FILENAME.exec(filename);
  if (!match?.[1]) {
    throw new Error(`Nome de migration inválido: ${filename}`);
  }
  return match[1];
}

function readApplied(db: DatabaseSync, version: string): AppliedMigration | undefined {
  const row = db
    .prepare(
      `SELECT version, filename, checksum, applied_at AS appliedAt FROM ${SCHEMA_MIGRATIONS_TABLE} WHERE version = ?`,
    )
    .get(version);
  if (!row) {
    return undefined;
  }
  return {
    version: String(row.version),
    filename: String(row.filename),
    checksum: String(row.checksum),
    appliedAt: String(row.appliedAt),
  };
}

function sha256(contents: string): string {
  return crypto.createHash('sha256').update(contents).digest('hex');
}
