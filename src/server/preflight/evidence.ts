import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';

export type LeaseClaim = {
  readonly owner: string;
  readonly sha: string;
  readonly resources: readonly string[];
};
export type Lease = LeaseClaim & { readonly id: string; readonly expiresAt: number };
const SHA = /^[a-f0-9]{40}$/;
const MAX_TTL = 30 * 60_000;

/** SQLite transacional. Expiração bloqueia o titular; não libera automaticamente
 * recursos de um processo que possa ainda estar em execução. */
export class EvidenceLeaseStore {
  constructor(private readonly db: DatabaseSync) {}
  static provision(db: DatabaseSync): void {
    db.exec(`CREATE TABLE IF NOT EXISTS preflight_lease (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, sha TEXT NOT NULL, expires_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS preflight_resource (
      resource TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES preflight_lease(id)
    );`);
  }
  acquire(claim: LeaseClaim, ttlMs: number, now = Date.now()): Lease {
    if (!claim.owner.trim() || !SHA.test(claim.sha) || !Number.isSafeInteger(ttlMs) ||
        ttlMs <= 0 || ttlMs > MAX_TTL || !claim.resources.length ||
        claim.resources.some((resource) => !resource.trim()) ||
        new Set(claim.resources).size !== claim.resources.length) throw new Error('claim inválido');
    const id = crypto.randomUUID();
    const expiresAt = now + ttlMs;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO preflight_lease VALUES (?, ?, ?, ?)').run(id, claim.owner, claim.sha, expiresAt);
      const add = this.db.prepare('INSERT INTO preflight_resource VALUES (?, ?)');
      for (const resource of claim.resources) add.run(resource, id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { ...claim, id, expiresAt };
  }
  verify(id: string, claim: LeaseClaim, now = Date.now()): boolean {
    try {
      const row = this.db.prepare('SELECT owner, sha, expires_at FROM preflight_lease WHERE id = ?').get(id);
      if (!row || row.owner !== claim.owner || row.sha !== claim.sha ||
          typeof row.expires_at !== 'number' || row.expires_at <= now) return false;
      const keys = this.db.prepare('SELECT resource FROM preflight_resource WHERE lease_id = ? ORDER BY resource')
        .all(id).map((entry) => String(entry.resource));
      return JSON.stringify(keys) === JSON.stringify([...claim.resources].sort());
    } catch {
      return false;
    }
  }
  renew(id: string, claim: LeaseClaim, ttlMs: number, now = Date.now()): boolean {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL) return false;
    if (!this.verify(id, claim, now)) return false;
    const result = this.db.prepare(
      'UPDATE preflight_lease SET expires_at = ? WHERE id = ? AND owner = ? AND sha = ? AND expires_at > ?',
    ).run(now + ttlMs, id, claim.owner, claim.sha, now);
    return Number(result.changes) === 1;
  }
}

export type LocalEvidenceSpec = {
  readonly worktree: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly branch: string;
  readonly dependencies: string;
  readonly envFile: string;
  readonly database: string;
  readonly logs: string;
  readonly artifacts: string;
  readonly namespace: string;
  readonly port: number;
  readonly owner: string;
  readonly runnerId: string;
  readonly leaseId: string;
  readonly minFreeBytes: number;
  readonly minFreeRamBytes: number;
  readonly allowedWritePaths: readonly string[];
};
/** A implementação deve vir do bootstrap autenticado; nunca de request JSON. */
export type RunnerAttestation = { readonly runnerId: string; readonly owner: string; readonly pid: number };
export type EvidenceResult = { readonly status: 'PASS' | 'BLOQUEADO'; readonly checks: Readonly<Record<string, boolean>> };

function canonical(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function real(value: string, directory: boolean): string {
  if (!path.isAbsolute(value)) throw new Error('path não absoluto');
  const resolved = path.resolve(value);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('symlink/junction');
  }
  const actual = fs.realpathSync.native(resolved);
  if (canonical(actual) !== canonical(resolved)) throw new Error('alias de path');
  const stat = fs.statSync(actual);
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error('tipo de path');
  return canonical(actual);
}
function inside(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}
function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 }).trim();
}
export function resourceKeys(spec: LocalEvidenceSpec): string[] {
  return [
    'branch:' + spec.branch, 'worktree:' + real(spec.worktree, true),
    'deps:' + real(spec.dependencies, true), 'env:' + real(spec.envFile, false),
    'db:' + real(spec.database, false), 'logs:' + real(spec.logs, true),
    'artifacts:' + real(spec.artifacts, true), 'namespace:' + spec.namespace,
    'port:' + String(spec.port),
  ].sort();
}
async function freePort(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return false;
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => resolve(error === undefined));
    });
  });
}
/** Observa ambiente real e lease persistido. Sem atestado autenticado ou
 * qualquer evidência ausente, bloqueia. Não executa missões nem ativa runners. */
export async function verifyLocalEvidence(
  spec: LocalEvidenceSpec, leases: EvidenceLeaseStore,
  attest: (() => RunnerAttestation | undefined) | undefined,
): Promise<EvidenceResult> {
  const checks: Record<string, boolean> = {
    runner: false, git: false, paths: false, ownership: false, port: false,
    resources: false, lease: false, writeAllowlist: false,
  };
  try {
    const runner = attest?.();
    checks.runner = !!runner && runner.runnerId === spec.runnerId &&
      runner.owner === spec.owner && runner.pid === process.pid;
    checks.ownership = checks.runner && !!spec.owner.trim() && !!spec.namespace.trim();
    const root = real(spec.worktree, true);
    const deps = real(spec.dependencies, true);
    const env = real(spec.envFile, false);
    const db = real(spec.database, false);
    const logs = real(spec.logs, true);
    const artifacts = real(spec.artifacts, true);
    checks.paths = [deps, env, db, logs, artifacts].every((value) => inside(root, value)) &&
      new Set([deps, env, db, logs, artifacts]).size === 5 &&
      ![env, db, logs, artifacts].some((value) => inside(deps, value)) &&
      !inside(logs, artifacts) && !inside(artifacts, logs);
    checks.git = SHA.test(spec.headSha) && SHA.test(spec.baseSha) &&
      canonical(git(root, ['rev-parse', '--show-toplevel'])) === root &&
      git(root, ['rev-parse', 'HEAD']) === spec.headSha &&
      git(root, ['symbolic-ref', '--short', 'HEAD']) === spec.branch &&
      git(root, ['status', '--porcelain', '--untracked-files=all']) === '';
    if (checks.git) git(root, ['merge-base', '--is-ancestor', spec.baseSha, spec.headSha]);
    checks.port = await freePort(spec.port);
    const disk = fs.statfsSync(root);
    checks.resources = Number.isSafeInteger(spec.minFreeBytes) && spec.minFreeBytes > 0 &&
      Number.isSafeInteger(spec.minFreeRamBytes) && spec.minFreeRamBytes > 0 &&
      disk.bavail * disk.bsize >= spec.minFreeBytes &&
      os.freemem() >= spec.minFreeRamBytes && os.cpus().length > 0;
    checks.writeAllowlist = spec.allowedWritePaths.length > 0 &&
      spec.allowedWritePaths.every((value) => inside(root, real(value, true)) &&
        !inside(deps, real(value, true)) && real(value, true) !== deps);
    checks.lease = leases.verify(spec.leaseId, { owner: spec.owner, sha: spec.headSha, resources: resourceKeys(spec) });
  } catch {
    // Any failed observation invalidates the complete verdict.
    return { status: 'BLOQUEADO', checks };
  }
  return { status: Object.values(checks).every(Boolean) ? 'PASS' : 'BLOQUEADO', checks };
}
