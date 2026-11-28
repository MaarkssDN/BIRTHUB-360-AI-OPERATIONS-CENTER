import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EvidenceLeaseStore, verifyLocalEvidence, type LocalEvidenceSpec } from './evidence.ts';

const sha = 'a'.repeat(40);

test('lease rejeita colisão, identidade divergente, SHA alterado e expiração', () => {
  const db = new DatabaseSync(':memory:');
  try {
    EvidenceLeaseStore.provision(db);
    const store = new EvidenceLeaseStore(db);
    const claim = { owner: 'synthetic-a', sha, resources: ['db:synthetic', 'port:3001'] };
    const lease = store.acquire(claim, 1000, 100);
    assert.equal(store.verify(lease.id, claim, 200), true);
    assert.equal(store.verify(lease.id, { ...claim, owner: 'synthetic-b' }, 200), false);
    assert.equal(store.verify(lease.id, { ...claim, sha: 'b'.repeat(40) }, 200), false);
    assert.equal(store.verify(lease.id, { ...claim, resources: ['db:synthetic'] }, 200), false);
    assert.throws(() => store.acquire({ ...claim, owner: 'synthetic-b' }, 1000, 200));
    assert.equal(store.renew(lease.id, claim, 1000, 500), true);
    assert.equal(store.verify(lease.id, claim, 1100), true);
    assert.equal(store.verify(lease.id, claim, 1500), false);
    assert.equal(store.renew(lease.id, claim, 1000, 1500), false);
    assert.throws(() => store.acquire({ ...claim, owner: 'synthetic-b' }, 1000, 1600));
  } finally { db.close(); }
});

test('ausência de runner e paths reais bloqueia preflight', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    EvidenceLeaseStore.provision(db);
    const spec = {
      worktree: 'not-absolute', baseSha: sha, headSha: sha, branch: 'synthetic',
      dependencies: '', envFile: '', database: '', logs: '', artifacts: '',
      namespace: 'synthetic', port: 3010, owner: 'synthetic', runnerId: 'synthetic',
      leaseId: 'missing', minFreeBytes: 1, minFreeRamBytes: 1, allowedWritePaths: [],
    } satisfies LocalEvidenceSpec;
    const result = await verifyLocalEvidence(spec, new EvidenceLeaseStore(db), undefined);
    assert.equal(result.status, 'BLOQUEADO');
    assert.equal(result.checks.runner, false);
    assert.equal(result.checks.lease, false);
  } finally { db.close(); }
});
