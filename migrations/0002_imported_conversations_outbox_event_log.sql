-- ============================================================================
-- BIRTHUB 360 — AI OPERATIONS CENTER (B360-AOC)
-- MIGRATION 0002: ImportedConversations, Outbox e EventLog
-- No repositório antigo este arquivo era a 0003, porque a 0002 de lá era seed.
-- Aqui a sequência é só schema: 0001 (44 tabelas) e esta 0002 (3 tabelas).
-- Sem tenant_id (decisão multi-tenant pendente). Sem dados reais.
-- Aplicar só pelo runner local (src/db/migrate.ts). Sem D1 e sem wrangler.
-- ============================================================================

-- 45ª entidade. No modelo antigo, ImportedConversationReport vivia em
-- B360DatabaseState.importedConversations e não tinha CREATE TABLE na 0001.
-- Arrays extraídos são texto livre (não são IDs): sem FKs.
-- content_fingerprint UNIQUE reproduz a reimportação idempotente.
CREATE TABLE IF NOT EXISTS ImportedConversations (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  source_folder_url TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  raw_text_preserved TEXT NOT NULL,
  participants_identified_json TEXT NOT NULL,
  chronology_entries_json TEXT NOT NULL,
  decisions_extracted_json TEXT NOT NULL,
  completed_work_json TEXT NOT NULL,
  pending_work_json TEXT NOT NULL,
  blockers_identified_json TEXT NOT NULL,
  contradictions_detected_json TEXT NOT NULL,
  authorization_requests_json TEXT NOT NULL,
  branches_and_commits_json TEXT NOT NULL,
  evidences_referenced_json TEXT NOT NULL,
  diagnostic_summary TEXT NOT NULL,
  proposed_waves_json TEXT NOT NULL,
  generated_prompts_json TEXT NOT NULL,
  generated_checklist_items_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_imported_conversations_imported_at
  ON ImportedConversations(imported_at);

-- Fila local de eventos pendentes de despacho.
-- idempotency_key UNIQUE impede o mesmo efeito duas vezes.
-- O índice parcial cobre o despacho: status = 'PENDENTE' ordenado por available_at.
CREATE TABLE IF NOT EXISTS Outbox (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDENTE', 'EM_DESPACHO', 'DESPACHADO', 'FALHOU')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dispatched_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending_dispatch
  ON Outbox(available_at, id)
  WHERE status = 'PENDENTE';

-- Trilha append-only, ordenada por sequence_no.
-- entity_type + entity_id apontam a entidade de domínio; correlation_id agrupa o fluxo.
-- Sem FK: a referência é polimórfica. UPDATE e DELETE são abortados pelos triggers.
CREATE TABLE IF NOT EXISTS EventLog (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE CHECK(sequence_no > 0),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_entity
  ON EventLog(entity_type, entity_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_event_log_correlation
  ON EventLog(correlation_id, sequence_no);

CREATE TRIGGER IF NOT EXISTS event_log_no_update
BEFORE UPDATE ON EventLog
BEGIN
  SELECT RAISE(ABORT, 'EventLog is append-only');
END;

CREATE TRIGGER IF NOT EXISTS event_log_no_delete
BEFORE DELETE ON EventLog
BEGIN
  SELECT RAISE(ABORT, 'EventLog is append-only');
END;
