import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeHealth, describeReady } from './status.ts';

test('saúde operacional e indisponível', () => {
  assert.equal(
    describeHealth({ status: 'ok', service: 'b360-aoc', persistence: 'fail-closed' }, null),
    'Operacional',
  );
  assert.equal(describeHealth(null, null), 'Consultando /api/health…');
  assert.equal(describeHealth(null, 'rede'), 'Indisponível · rede');
});

test('prontidão pronta e fail-closed', () => {
  assert.equal(
    describeReady(200, { status: 'ready', schemaVersion: 1, seed: 'synthetic' }, null),
    'Pronto · schema 1 · seed synthetic',
  );
  assert.equal(
    describeReady(503, { status: 'not-ready', error: 'Arquivo do banco não existe. Carga fail-closed: nada foi semeado.' }, null),
    'Fail-closed · Arquivo do banco não existe. Carga fail-closed: nada foi semeado.',
  );
  assert.equal(describeReady(0, null, null), 'Consultando /api/ready…');
});
