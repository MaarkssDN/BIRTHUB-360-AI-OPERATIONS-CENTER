import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAuditorIndependence } from './independence.ts';

test('executor e auditor distintos passam', () => {
  assert.deepEqual(
    evaluateAuditorIndependence({
      executorAgentId: 'AG-SYN-EXEC',
      auditorAgentId: 'AG-SYN-AUD',
    }),
    { ok: true },
  );
});

test('o mesmo identificador é autoaprovação, inclusive com espaços', () => {
  assert.deepEqual(
    evaluateAuditorIndependence({
      executorAgentId: ' AG-SYN-EXEC ',
      auditorAgentId: 'AG-SYN-EXEC',
    }),
    { ok: false, reason: 'AUTOAPROVACAO' },
  );
});

test('identidade em branco não passa', () => {
  assert.deepEqual(
    evaluateAuditorIndependence({
      executorAgentId: 'AG-SYN-EXEC',
      auditorAgentId: '   ',
    }),
    { ok: false, reason: 'IDENTIDADE_AUSENTE' },
  );
});
