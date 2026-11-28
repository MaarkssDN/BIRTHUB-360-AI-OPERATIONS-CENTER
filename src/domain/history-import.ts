import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Stub da onda 09. A porta de fonte só aceita envelope sintético.
 * O pipeline só roda em dry-run e não escreve. Não há cliente de rede,
 * SDK do Google nem caminho de apply.
 *
 * Credencial, escopo OAuth e dado real continuam bloqueados até OK escrito
 * do Marcelo. Ver docs/onda-09-importador.md.
 */

export const MAX_NORMALIZED_BODY_CHARS = 45_000;

export const IMPORT_ERROR_CODES = [
  'SOURCE_NOT_SYNTHETIC',
  'SOURCE_UNAVAILABLE',
  'DOCUMENT_INVALID',
  'PATH_REJECTED',
  'EMPTY_BODY',
  'BODY_TOO_LARGE',
  'REVISION_CONFLICT',
] as const;

const SOURCE_ID_PATTERN = /^SYN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const REVISION_PATTERN = /^rev-[a-z0-9]+$/;
const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const ImportErrorCodeSchema = z.enum(IMPORT_ERROR_CODES);

export const ImportErrorSchema = z
  .object({
    code: ImportErrorCodeSchema,
    source_id: z.string().min(1).nullable(),
    message: z.string().min(1),
  })
  .strict();

export const ManifestItemSchema = z
  .object({
    source_id: z.string().regex(SOURCE_ID_PATTERN),
    revision: z.string().regex(REVISION_PATTERN),
    relative_path: z.string().min(1),
    idempotency_key: z.string().min(1),
    content_hash: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export const ImportManifestSchema = z
  .object({
    schema_version: z.literal(1),
    origin: z.literal('synthetic'),
    mode: z.literal('dry-run'),
    counts: z
      .object({
        documents: z.number().int().nonnegative(),
        planned: z.number().int().nonnegative(),
        errors: z.number().int().nonnegative(),
      })
      .strict(),
    items: z.array(ManifestItemSchema),
    errors: z.array(ImportErrorSchema),
    manifest_hash: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export const ParityReportSchema = z
  .object({
    schema_version: z.literal(1),
    origin: z.literal('synthetic'),
    counts: z
      .object({
        planned: z.number().int().nonnegative(),
        destination: z.number().int().nonnegative(),
        matched: z.number().int().nonnegative(),
        missing_in_destination: z.number().int().nonnegative(),
        extra_in_destination: z.number().int().nonnegative(),
        hash_mismatches: z.number().int().nonnegative(),
      })
      .strict(),
    missing_in_destination: z.array(z.string()),
    extra_in_destination: z.array(z.string()),
    hash_mismatches: z.array(z.string()),
    ok: z.boolean(),
  })
  .strict();

export const DestinationRecordSchema = z
  .object({
    idempotency_key: z.string().min(1),
    content_hash: z.string().regex(SHA256_PATTERN),
    source_id: z.string().regex(SOURCE_ID_PATTERN),
    revision: z.string().regex(REVISION_PATTERN),
    relative_path: z.string().min(1),
    body: z.string(),
  })
  .strict();

const SourceDocumentSchema = z
  .object({
    source_id: z.string().regex(SOURCE_ID_PATTERN),
    revision: z.string().regex(REVISION_PATTERN),
    relative_path: z.string(),
    media_type: z.enum(['text/plain', 'text/markdown']),
    body: z.string(),
  })
  .strict();

const EnvelopeProbeSchema = z
  .object({
    origin: z.unknown(),
    documents: z.unknown(),
  })
  .strict();

export type ImportErrorCode = z.infer<typeof ImportErrorCodeSchema>;
export type ImportError = z.infer<typeof ImportErrorSchema>;
export type ImportManifest = z.infer<typeof ImportManifestSchema>;
export type ParityReport = z.infer<typeof ParityReportSchema>;
export type DestinationRecord = z.infer<typeof DestinationRecordSchema>;
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export type SourceReadResult =
  | { readonly ok: true; readonly documents: readonly unknown[] }
  | { readonly ok: false; readonly code: 'SOURCE_UNAVAILABLE' | 'SOURCE_NOT_SYNTHETIC'; readonly message: string };

export interface HistorySourcePort {
  readonly origin: 'synthetic';
  readDocuments(): SourceReadResult;
}

export interface HistoryDestinationPort {
  readAll(): readonly DestinationRecord[];
}

export interface UpsertResult {
  inserted: number;
  unchanged: number;
  conflicts: string[];
}

export interface InMemoryHistoryDestination extends HistoryDestinationPort {
  upsert(records: readonly DestinationRecord[]): UpsertResult;
}

export interface DryRunResult {
  manifest: ImportManifest;
  parity: ParityReport;
  planned: DestinationRecord[];
}

type Json = null | boolean | number | string | Json[] | { readonly [key: string]: Json };

export function normalizeBody(body: string): string {
  return body.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function isSafeRelativePath(value: string): boolean {
  if (value.length < 3 || value.length > 240) {
    return false;
  }
  if (value.includes('\\') || value.includes(':') || value.includes('..')) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('.')) {
    return false;
  }
  if (/[?#%@\s]/.test(value) || value.includes('//')) {
    return false;
  }
  const segments = value.split('/');
  if (segments.length < 2) {
    return false;
  }
  return segments.every((segment) => PATH_SEGMENT.test(segment));
}

export function createSyntheticFixtureSource(input: unknown): HistorySourcePort {
  return {
    origin: 'synthetic',
    readDocuments() {
      const probe = EnvelopeProbeSchema.safeParse(input);
      if (!probe.success) {
        return {
          ok: false,
          code: 'SOURCE_UNAVAILABLE',
          message: 'envelope sintético ilegível ou fora do contrato',
        };
      }
      if (probe.data.origin !== 'synthetic') {
        return {
          ok: false,
          code: 'SOURCE_NOT_SYNTHETIC',
          message: 'a porta recusa origem que não seja synthetic',
        };
      }
      if (!Array.isArray(probe.data.documents)) {
        return {
          ok: false,
          code: 'SOURCE_UNAVAILABLE',
          message: 'documents ausente no envelope sintético',
        };
      }
      return { ok: true, documents: probe.data.documents };
    },
  };
}

export function createInMemoryDestination(
  initial: readonly DestinationRecord[] = [],
): InMemoryHistoryDestination {
  const byKey = new Map<string, DestinationRecord>();
  for (const record of initial) {
    const parsed = DestinationRecordSchema.parse(record);
    byKey.set(parsed.idempotency_key, parsed);
  }
  return {
    readAll() {
      return [...byKey.values()].sort((left, right) =>
        compareText(left.idempotency_key, right.idempotency_key),
      );
    },
    upsert(records) {
      let inserted = 0;
      let unchanged = 0;
      const conflicts: string[] = [];
      for (const record of records) {
        const parsed = DestinationRecordSchema.parse(record);
        const current = byKey.get(parsed.idempotency_key);
        if (!current) {
          byKey.set(parsed.idempotency_key, parsed);
          inserted += 1;
          continue;
        }
        if (current.content_hash === parsed.content_hash) {
          unchanged += 1;
          continue;
        }
        conflicts.push(parsed.idempotency_key);
      }
      conflicts.sort(compareText);
      return { inserted, unchanged, conflicts };
    },
  };
}

export function runDryRunImport(input: {
  source: HistorySourcePort;
  destination: HistoryDestinationPort;
}): DryRunResult {
  const read = input.source.readDocuments();
  const errors: ImportError[] = [];
  const accepted: Array<SourceDocument & { body: string }> = [];

  if (!read.ok) {
    errors.push({ code: read.code, source_id: null, message: read.message });
  } else {
    for (const document of read.documents) {
      const outcome = classifyDocument(document);
      if (!outcome.ok) {
        errors.push(outcome.error);
        continue;
      }
      accepted.push(outcome.document);
    }
  }

  const planned = planDocuments(accepted, errors);
  errors.sort((left, right) => {
    const byCode = compareText(left.code, right.code);
    if (byCode !== 0) {
      return byCode;
    }
    return compareText(left.source_id ?? '', right.source_id ?? '');
  });

  const items = planned
    .map((record) => ({
      source_id: record.source_id,
      revision: record.revision,
      relative_path: record.relative_path,
      idempotency_key: record.idempotency_key,
      content_hash: record.content_hash,
    }))
    .sort((left, right) => compareText(left.idempotency_key, right.idempotency_key));

  const manifestBody = {
    schema_version: 1 as const,
    origin: 'synthetic' as const,
    mode: 'dry-run' as const,
    counts: {
      documents: read.ok ? read.documents.length : 0,
      planned: items.length,
      errors: errors.length,
    },
    items,
    errors,
  };
  const manifest = ImportManifestSchema.parse({
    ...manifestBody,
    manifest_hash: sha256Hex(stableStringify(manifestBody)),
  });
  const parity = compareParity(planned, input.destination.readAll(), errors.length === 0);
  return { manifest, parity, planned };
}

function classifyDocument(
  input: unknown,
): { ok: true; document: SourceDocument } | { ok: false; error: ImportError } {
  const parsed = SourceDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'DOCUMENT_INVALID',
        source_id: readSourceId(input),
        message: 'documento fora do contrato sintético',
      },
    };
  }
  const document = parsed.data;
  if (!isSafeRelativePath(document.relative_path)) {
    return {
      ok: false,
      error: {
        code: 'PATH_REJECTED',
        source_id: document.source_id,
        message: 'caminho relativo recusado',
      },
    };
  }
  const body = normalizeBody(document.body);
  if (body.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: 'EMPTY_BODY',
        source_id: document.source_id,
        message: 'corpo vazio',
      },
    };
  }
  if (body.length > MAX_NORMALIZED_BODY_CHARS) {
    return {
      ok: false,
      error: {
        code: 'BODY_TOO_LARGE',
        source_id: document.source_id,
        message: 'corpo acima do teto de 45000 caracteres',
      },
    };
  }
  return { ok: true, document: { ...document, body } };
}

function planDocuments(documents: readonly SourceDocument[], errors: ImportError[]): DestinationRecord[] {
  const grouped = new Map<string, DestinationRecord[]>();
  for (const document of documents) {
    const contentHash = sha256Hex(document.body);
    const idempotencyKey = `${document.source_id}@${document.revision}`;
    const record: DestinationRecord = {
      idempotency_key: idempotencyKey,
      content_hash: contentHash,
      source_id: document.source_id,
      revision: document.revision,
      relative_path: document.relative_path,
      body: document.body,
    };
    const bucket = grouped.get(idempotencyKey);
    if (bucket) {
      bucket.push(record);
    } else {
      grouped.set(idempotencyKey, [record]);
    }
  }

  const planned: DestinationRecord[] = [];
  for (const [idempotencyKey, records] of grouped) {
    const hashes = new Set(records.map((record) => record.content_hash));
    const sample = records[0];
    if (!sample || hashes.size !== 1) {
      errors.push({
        code: 'REVISION_CONFLICT',
        source_id: sample?.source_id ?? null,
        message: `revisão com hashes divergentes: ${idempotencyKey}`,
      });
      continue;
    }
    planned.push(sample);
  }
  planned.sort((left, right) => compareText(left.idempotency_key, right.idempotency_key));
  return planned;
}

function compareParity(
  planned: readonly DestinationRecord[],
  stored: readonly DestinationRecord[],
  sourceClean: boolean,
): ParityReport {
  const destination = new Map(stored.map((record) => [record.idempotency_key, record]));
  const plannedKeys = new Set(planned.map((record) => record.idempotency_key));
  const missing: string[] = [];
  const mismatches: string[] = [];
  let matched = 0;
  for (const record of planned) {
    const found = destination.get(record.idempotency_key);
    if (!found) {
      missing.push(record.idempotency_key);
      continue;
    }
    if (found.content_hash !== record.content_hash) {
      mismatches.push(record.idempotency_key);
      continue;
    }
    matched += 1;
  }
  const extra = [...destination.keys()].filter((key) => !plannedKeys.has(key));
  missing.sort(compareText);
  extra.sort(compareText);
  mismatches.sort(compareText);
  return ParityReportSchema.parse({
    schema_version: 1,
    origin: 'synthetic',
    counts: {
      planned: planned.length,
      destination: stored.length,
      matched,
      missing_in_destination: missing.length,
      extra_in_destination: extra.length,
      hash_mismatches: mismatches.length,
    },
    missing_in_destination: missing,
    extra_in_destination: extra,
    hash_mismatches: mismatches,
    ok: sourceClean && missing.length === 0 && extra.length === 0 && mismatches.length === 0,
  });
}

function readSourceId(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  if (!('source_id' in input)) {
    return null;
  }
  const sourceId = input.source_id;
  return typeof sourceId === 'string' && sourceId.length > 0 ? sourceId : null;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function stableStringify(value: Json): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (value !== null && typeof value === 'object') {
    const sorted: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort(compareText)) {
      const child = value[key];
      if (child !== undefined) {
        sorted[key] = sortJson(child);
      }
    }
    return sorted;
  }
  return value;
}
