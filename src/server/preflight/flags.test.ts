import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import {
  PREFLIGHT_FLAG_NAMES,
  PREFLIGHT_FLAGS,
  assertPreflightBirthClosed,
  preflightAllows,
  resolvePreflight,
} from './flags.ts';

test('nenhuma flag de preflight nasce true ou liberada', () => {
  assert.ok(PREFLIGHT_FLAG_NAMES.length > 0);
  for (const name of PREFLIGHT_FLAG_NAMES) {
    const value = PREFLIGHT_FLAGS[name];
    assert.ok(value === false || value === 'PENDENTE', name);
    assert.equal(preflightAllows(name), false, name);
    const decision = resolvePreflight(name);
    assert.ok(decision === 'BLOQUEADO' || decision === 'PENDENTE', name);
  }
  for (const value of Object.values(PREFLIGHT_FLAGS)) {
    assert.notEqual(value, 'LIBERADO');
  }
  assert.doesNotThrow(() => {
    assertPreflightBirthClosed();
  });
});

test('ausência, valor inválido ou erro bloqueiam, e o ambiente não libera', () => {
  const previous = process.env.B360_PREFLIGHT_RELEASE_AUTHORIZED;
  process.env.B360_PREFLIGHT_RELEASE_AUTHORIZED = 'true';
  try {
    assert.equal(resolvePreflight('releaseAuthorized'), 'BLOQUEADO');
    assert.equal(preflightAllows('releaseAuthorized'), false);
    assert.equal(preflightAllows('publicBind'), false);
    assert.equal(resolvePreflight('releaseAuthorized', () => undefined), 'BLOQUEADO');
    assert.equal(resolvePreflight('releaseAuthorized', () => null), 'BLOQUEADO');
    assert.equal(resolvePreflight('releaseAuthorized', () => true), 'BLOQUEADO');
    assert.equal(resolvePreflight('releaseAuthorized', () => 'true'), 'BLOQUEADO');
    assert.equal(resolvePreflight('releaseAuthorized', () => '1'), 'BLOQUEADO');
    assert.equal(resolvePreflight('releaseAuthorized', () => 'yes'), 'BLOQUEADO');
    assert.equal(resolvePreflight('releaseAuthorized', () => 'LIBERADO '), 'BLOQUEADO');
    assert.equal(resolvePreflight('desconhecida', () => 'LIBERADO'), 'BLOQUEADO');
    assert.equal(
      resolvePreflight('releaseAuthorized', () => {
        throw new Error('falha de leitura');
      }),
      'BLOQUEADO',
    );
    assert.equal(preflightAllows('releaseAuthorized', () => true), false);
    assert.equal(resolvePreflight('durableSessionStore', () => 'LIBERADO'), 'LIBERADO');
  } finally {
    if (previous === undefined) delete process.env.B360_PREFLIGHT_RELEASE_AUTHORIZED;
    else process.env.B360_PREFLIGHT_RELEASE_AUTHORIZED = previous;
  }
});

test('o módulo de preflight não contém o literal true nem lê o ambiente', async () => {
  const source = await fs.readFile(new URL('./flags.ts', import.meta.url), 'utf8');
  assert.equal(/\btrue\b/.test(source), false);
  assert.equal(source.includes('process.env'), false);
});
