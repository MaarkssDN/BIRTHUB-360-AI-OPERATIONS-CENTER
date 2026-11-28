import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveListenHost, resolveListenPort } from './listen.ts';

const originalHost = process.env.B360_AOC_HOST;
const originalPort = process.env.B360_AOC_PORT;

function restore(name: 'B360_AOC_HOST' | 'B360_AOC_PORT', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restore('B360_AOC_HOST', originalHost);
  restore('B360_AOC_PORT', originalPort);
});

test('o host padrão é loopback e 0.0.0.0 é recusado', () => {
  delete process.env.B360_AOC_HOST;
  assert.equal(resolveListenHost(), '127.0.0.1');
  process.env.B360_AOC_HOST = '   ';
  assert.equal(resolveListenHost(), '127.0.0.1');
  process.env.B360_AOC_HOST = 'localhost';
  assert.equal(resolveListenHost(), 'localhost');
  process.env.B360_AOC_HOST = '::1';
  assert.equal(resolveListenHost(), '::1');
  process.env.B360_AOC_HOST = '0.0.0.0';
  assert.throws(() => resolveListenHost(), /Bind público recusado \(0\.0\.0\.0\)/);
  process.env.B360_AOC_HOST = '::';
  assert.throws(() => resolveListenHost(), /Bind público recusado/);
});

test('a porta padrão é 3000 e valores inválidos falham', () => {
  delete process.env.B360_AOC_PORT;
  assert.equal(resolveListenPort(), 3000);
  process.env.B360_AOC_PORT = '8080';
  assert.equal(resolveListenPort(), 8080);
  process.env.B360_AOC_PORT = '0';
  assert.throws(() => resolveListenPort(), /inválida/);
  process.env.B360_AOC_PORT = '70000';
  assert.throws(() => resolveListenPort(), /inválida/);
  process.env.B360_AOC_PORT = 'abc';
  assert.throws(() => resolveListenPort(), /inválida/);
});
