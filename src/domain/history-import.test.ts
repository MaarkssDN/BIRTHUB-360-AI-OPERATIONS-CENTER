import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  MAX_NORMALIZED_BODY_CHARS,
  createInMemoryDestination,
  createSyntheticFixtureSource,
  runDryRunImport,
  sha256Hex,
} from './history-import.ts';

const FIXTURE = path.resolve('test/fixtures/onda-09-synthetic-source.json');

function loadFixture(): unknown {
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  return JSON.parse(raw) as unknown;
}

function runFixture() {
  return runDryRunImport({
    source: createSyntheticFixtureSource(loadFixture()),
    destination: createInMemoryDestination(),
  });
}

test('dry-run da fixture sintética gera manifesto e não escreve no destino', () => {
  const destination = createInMemoryDestination();
  const result = runDryRunImport({
    source: createSyntheticFixtureSource(loadFixture()),
    destination,
  });
  assert.equal(result.manifest.origin, 'synthetic');
  assert.equal(result.manifest.mode, 'dry-run');
  assert.equal(result.manifest.counts.documents, 2);
  assert.equal(result.manifest.counts.planned, 2);
  assert.equal(result.manifest.counts.errors, 0);
  assert.equal(result.planned.length, 2);
  assert.deepEqual(
    result.manifest.items.map((item) => item.idempotency_key),
    ['SYN-SRC-001@rev-1', 'SYN-SRC-002@rev-1'],
  );
  assert.match(result.manifest.manifest_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.parity.ok, false);
  assert.deepEqual(result.parity.missing_in_destination, [
    'SYN-SRC-001@rev-1',
    'SYN-SRC-002@rev-1',
  ]);
  assert.deepEqual(destination.readAll(), []);
});

test('duas execuções produzem o mesmo manifesto', () => {
  const first = runFixture();
  const second = runFixture();
  assert.deepEqual(second.manifest, first.manifest);
  assert.equal(second.manifest.manifest_hash, first.manifest.manifest_hash);
  assert.deepEqual(second.planned, first.planned);
  assert.deepEqual(second.parity, first.parity);
});

test('paridade fecha no fake em memória e a segunda gravação não duplica', () => {
  const destination = createInMemoryDestination();
  const before = runDryRunImport({
    source: createSyntheticFixtureSource(loadFixture()),
    destination,
  });
  const staged = destination.upsert(before.planned);
  assert.equal(staged.inserted, before.planned.length);
  assert.equal(staged.conflicts.length, 0);
  const repeated = destination.upsert(before.planned);
  assert.equal(repeated.inserted, 0);
  assert.equal(repeated.unchanged, before.planned.length);
  assert.equal(destination.readAll().length, before.planned.length);

  const after = runDryRunImport({
    source: createSyntheticFixtureSource(loadFixture()),
    destination,
  });
  assert.deepEqual(after.manifest, before.manifest);
  assert.equal(after.parity.ok, true);
  assert.equal(after.parity.counts.matched, before.planned.length);
  assert.deepEqual(after.parity.missing_in_destination, []);
  assert.deepEqual(after.parity.extra_in_destination, []);
  assert.deepEqual(after.parity.hash_mismatches, []);
});

test('hash divergente no destino aparece na paridade e o fake não é reescrito', () => {
  const projected = runFixture();
  const first = projected.planned[0];
  assert.ok(first);
  const otherHash = sha256Hex('outro-conteudo-sintetico');
  const destination = createInMemoryDestination([{ ...first, content_hash: otherHash }]);
  const report = runDryRunImport({
    source: createSyntheticFixtureSource(loadFixture()),
    destination,
  });
  assert.equal(report.parity.ok, false);
  assert.deepEqual(report.parity.hash_mismatches, [first.idempotency_key]);
  assert.equal(destination.readAll()[0]?.content_hash, otherHash);
  assert.deepEqual(report.manifest, projected.manifest);
});

test('CRLF e LF da mesma revisão geram o mesmo manifesto', () => {
  const shared = {
    source_id: 'SYN-SRC-003',
    revision: 'rev-2',
    relative_path: 'synthetic/quebras.txt',
    media_type: 'text/plain' as const,
  };
  const crlf = runDryRunImport({
    source: createSyntheticFixtureSource({
      origin: 'synthetic',
      documents: [{ ...shared, body: 'linha\r\nlinha' }],
    }),
    destination: createInMemoryDestination(),
  });
  const lf = runDryRunImport({
    source: createSyntheticFixtureSource({
      origin: 'synthetic',
      documents: [{ ...shared, body: 'linha\nlinha' }],
    }),
    destination: createInMemoryDestination(),
  });
  assert.deepEqual(crlf.manifest, lf.manifest);
  assert.equal(crlf.planned[0]?.body, 'linha\nlinha');
});

test('origem não sintética, caminho com .. e corpo inválido não entram no plano', () => {
  const foreign = runDryRunImport({
    source: createSyntheticFixtureSource({ origin: 'drive', documents: [] }),
    destination: createInMemoryDestination(),
  });
  assert.equal(foreign.manifest.counts.planned, 0);
  assert.equal(foreign.manifest.errors[0]?.code, 'SOURCE_NOT_SYNTHETIC');
  assert.equal(foreign.parity.ok, false);

  const leaked = runDryRunImport({
    source: createSyntheticFixtureSource({
      origin: 'synthetic',
      documents: [],
      planilha: 'fora-do-contrato',
    }),
    destination: createInMemoryDestination(),
  });
  assert.equal(leaked.manifest.errors[0]?.code, 'SOURCE_UNAVAILABLE');
  assert.equal(
    leaked.manifest.errors.some((error) => error.message.includes('fora-do-contrato')),
    false,
  );

  const rejected = runDryRunImport({
    source: createSyntheticFixtureSource({
      origin: 'synthetic',
      documents: [
        {
          source_id: 'SYN-SRC-009',
          revision: 'rev-1',
          relative_path: '../fora.txt',
          media_type: 'text/plain',
          body: 'nao deve ser planejado',
        },
        {
          source_id: 'SYN-SRC-010',
          revision: 'rev-1',
          relative_path: 'synthetic/vazio.txt',
          media_type: 'text/plain',
          body: ' \n\t',
        },
        {
          source_id: 'SYN-SRC-011',
          revision: 'rev-1',
          relative_path: 'synthetic/grande.txt',
          media_type: 'text/plain',
          body: 'a'.repeat(MAX_NORMALIZED_BODY_CHARS + 1),
        },
        {
          source_id: 'SYN-SRC-012',
          revision: 'rev-1',
          relative_path: 'https://example.com/nota.txt',
          media_type: 'text/plain',
          body: 'url recusada',
        },
      ],
    }),
    destination: createInMemoryDestination(),
  });
  assert.equal(rejected.manifest.counts.documents, 4);
  assert.equal(rejected.manifest.counts.planned, 0);
  assert.deepEqual(
    rejected.manifest.errors.map((error) => error.code),
    ['BODY_TOO_LARGE', 'EMPTY_BODY', 'PATH_REJECTED', 'PATH_REJECTED'],
  );
  assert.equal(rejected.parity.ok, false);
});

test('a mesma revisão com corpos diferentes é conflito e não é planejada', () => {
  const result = runDryRunImport({
    source: createSyntheticFixtureSource({
      origin: 'synthetic',
      documents: [
        {
          source_id: 'SYN-SRC-004',
          revision: 'rev-1',
          relative_path: 'synthetic/conflito-a.txt',
          media_type: 'text/plain',
          body: 'versao sintetica A',
        },
        {
          source_id: 'SYN-SRC-004',
          revision: 'rev-1',
          relative_path: 'synthetic/conflito-b.txt',
          media_type: 'text/plain',
          body: 'versao sintetica B',
        },
      ],
    }),
    destination: createInMemoryDestination(),
  });
  assert.equal(result.manifest.counts.planned, 0);
  assert.equal(result.manifest.errors[0]?.code, 'REVISION_CONFLICT');
  assert.equal(result.planned.length, 0);
});
