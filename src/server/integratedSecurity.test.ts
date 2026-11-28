import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { requireAuth } from './auth/requireAuth.ts';
import { provisionSecurityDatabase, SqliteSessionStore } from './auth/durableSecurity.ts';
import { registerPrincipal, issueAuthenticatedSession } from './auth/principalIssuer.ts';
import { TenantDomainCatalog } from '../persistence/tenantDomainCatalog.ts';
import { applyMigrations } from '../db/migrate.ts';
import { RELATIONAL_TABLES } from '../db/relationalCatalog.ts';
import { executeVerifiedProbe } from './preflight/executor.ts';
import { EvidenceLeaseStore, type LocalEvidenceSpec } from './preflight/evidence.ts';
import { MemoryKillSwitch } from './auth/killSwitch.ts';

test('credential issuer takes identity from registry, not role claimed by caller', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    provisionSecurityDatabase(db);
    const store = new SqliteSessionStore(db);
    const credential = registerPrincipal(db, { userId: 'synthetic-runner', tenantId: 'synthetic-a', role: 'operator', actorKind: 'runner' });
    await assert.rejects(() => issueAuthenticatedSession(db, store, 'x'.repeat(43)));
    const session = await issueAuthenticatedSession(db, store, credential);
    assert.equal(session.role, 'operator');
    assert.equal(session.actorKind, 'runner');
    assert.equal(session.tenantId, 'synthetic-a');
    assert.equal(db.prepare('SELECT credential_hash FROM aoc_principals').get()?.credential_hash === credential, false);
    db.exec('UPDATE aoc_principals SET active=0');
    await assert.rejects(() => issueAuthenticatedSession(db, store, credential));
  } finally { db.close(); }
});
test('all catalog domains use dedicated tenant DB, forged context and shared files are rejected', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aoc-tenant-catalog-'));
  const security = new DatabaseSync(':memory:');
  try {
    provisionSecurityDatabase(security);
    const store = new SqliteSessionStore(security);
    const files = new Map<string,string>();
    for (const tenant of ['synthetic-a','synthetic-b']) {
      const filename = path.join(dir, tenant + '.sqlite');
      const db = new DatabaseSync(filename);
      try {
        applyMigrations(db);
        db.exec('CREATE TABLE aoc_tenant_identity (id INTEGER PRIMARY KEY, tenant_id TEXT NOT NULL)');
        db.prepare('INSERT INTO aoc_tenant_identity VALUES (1,?)').run(tenant);
      } finally { db.close(); }
      files.set(tenant, filename);
    }
    const catalog = new TenantDomainCatalog(files);
    const credential = registerPrincipal(security, { userId:'user-synthetic',tenantId:'synthetic-a',role:'viewer',actorKind:'humano' });
    const session = await issueAuthenticatedSession(security,store,credential);
    const auth = await requireAuth({headers:{authorization:'Bearer '+session.sessionId}},{getSession:(id)=>store.get(id)});
    const counts = catalog.counts(auth);
    assert.equal(Object.keys(counts).length, RELATIONAL_TABLES.length);
    assert.throws(()=>catalog.counts({...auth,tenantId:'synthetic-b'}));
    const first = files.get('synthetic-a');
    assert.ok(first);
    assert.throws(()=>new TenantDomainCatalog(new Map([['a',first],['b',first]])));
  } finally { security.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
test('executor blocks forged runner and missing preflight', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    EvidenceLeaseStore.provision(db);
    const leases = new EvidenceLeaseStore(db);
    const spec = { worktree:'missing',baseSha:'a'.repeat(40),headSha:'b'.repeat(40),branch:'synthetic',
      dependencies:'',envFile:'',database:'',logs:'',artifacts:'',namespace:'synthetic',port:3011,
      owner:'synthetic',runnerId:'synthetic',leaseId:'missing',minFreeBytes:1,minFreeRamBytes:1,allowedWritePaths:[] } satisfies LocalEvidenceSpec;
    const auth = {userId:'synthetic',tenantId:'synthetic',role:'operator' as const,actorKind:'runner' as const,sessionId:'synthetic'};
    assert.equal((await executeVerifiedProbe(auth,spec,leases,new MemoryKillSwitch(),'synthetic')).status,'BLOQUEADO');
    provisionSecurityDatabase(db);
    const store = new SqliteSessionStore(db);
    const session = await store.create(auth);
    const verified = await requireAuth({headers:{authorization:'Bearer '+session.sessionId}},{getSession:(id)=>store.get(id)});
    assert.equal((await executeVerifiedProbe(verified,spec,leases,new MemoryKillSwitch(),'synthetic')).status,'BLOQUEADO');
  } finally { db.close(); }
});
