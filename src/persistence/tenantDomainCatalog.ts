import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RELATIONAL_TABLES } from '../db/relationalCatalog.ts';
import { assertAuthenticatedContext, type AuthContext } from '../server/auth/requireAuth.ts';

/** An explicit, trusted registry, never constructed from client input.
 * Dedicated databases isolate all domain tables, including unported domains.
 * No legacy shared database is assigned automatically; no SQL comes from clients. */
export class TenantDomainCatalog {
  private readonly files = new Map<string, { filename: string; dev: bigint; ino: bigint }>();
  constructor(entries: ReadonlyMap<string, string>) {
    for (const [tenant, filename] of entries) {
      if (!tenant.trim() || !path.isAbsolute(filename)) throw new Error('Registro inválido.');
      const resolved = path.resolve(filename);
      const stat = fs.lstatSync(resolved, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n ||
          fs.realpathSync.native(resolved) !== resolved) throw new Error('Arquivo inseguro.');
      if ([...this.files.values()].some((entry) => entry.dev === stat.dev && entry.ino === stat.ino)) {
        throw new Error('Banco compartilhado entre tenants.');
      }
      this.files.set(tenant, { filename: resolved, dev: stat.dev, ino: stat.ino });
    }
  }
  /** Read-only catalog; no rows, PII or untrusted SQL returned. */
  counts(auth: AuthContext): Readonly<Record<string, number>> {
    assertAuthenticatedContext(auth);
    const entry = this.files.get(auth.tenantId);
    if (!entry) throw new Error('Tenant sem banco provisionado.');
    const stat = fs.lstatSync(entry.filename, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n ||
        stat.dev !== entry.dev || stat.ino !== entry.ino ||
        fs.realpathSync.native(entry.filename) !== entry.filename) throw new Error('Banco alterado.');
    const db = new DatabaseSync(entry.filename, { readOnly: true });
    try {
      const marker = db.prepare('SELECT tenant_id FROM aoc_tenant_identity WHERE id=1').get();
      if (marker?.tenant_id !== auth.tenantId) throw new Error('Identidade do banco divergente.');
      const result: Record<string, number> = {};
      for (const table of RELATIONAL_TABLES) {
        const row = db.prepare('SELECT COUNT(*) AS total FROM "' + table + '"').get();
        result[table] = Number(row?.total);
      }
      return Object.freeze(result);
    } finally { db.close(); }
  }
}
