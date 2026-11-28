-- ============================================================================
-- BIRTHUB 360 — AI OPERATIONS CENTER (B360-AOC)
-- MIGRATION 0001: 44 TABELAS DE DOMÍNIO
-- O cabeçalho no transcript de origem dizia "45 ENTIDADES — SEÇÃO 25".
-- Essa 45ª entidade não está aqui; ImportedConversations entra na 0002.
-- Reconstrução e o que foi conferido: docs/schema-relacional.md.
-- Dialeto SQLite, compatível com o que a 0001 de origem declarava para D1.
-- Este runner não aplica nada em D1, wrangler ou outro alvo remoto.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_human_orchestrator INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES Roles(id),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  UNIQUE(role_id, resource, action)
);

CREATE TABLE IF NOT EXISTS Providers (
  id TEXT PRIMARY KEY, -- IA-01 .. IA-10
  name TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL,
  connection_status TEXT NOT NULL,
  role_description TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  integration_notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ProviderAccounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES Providers(id),
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  tier TEXT NOT NULL,
  additional_cost_limit_brl REAL NOT NULL DEFAULT 0.0,
  current_additional_spend_brl REAL NOT NULL DEFAULT 0.0,
  quota_status TEXT NOT NULL,
  renewal_policy TEXT NOT NULL,
  anti_abuse_rule TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Squads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  environment TEXT NOT NULL,
  coordinator_agent_id TEXT NOT NULL,
  coordinator_provider_id TEXT NOT NULL REFERENCES Providers(id),
  mission_scope TEXT NOT NULL,
  guardrails_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Agents (
  id TEXT PRIMARY KEY, -- AG-000 .. AG-100
  agent_number INTEGER NOT NULL UNIQUE CHECK(agent_number >= 0 AND agent_number <= 100),
  name TEXT NOT NULL,
  operational_persona TEXT NOT NULL,
  specialty TEXT NOT NULL,
  responsibilities_json TEXT NOT NULL,
  squad_id TEXT NOT NULL REFERENCES Squads(id),
  coordinator_id TEXT NOT NULL,
  associated_provider_id TEXT NOT NULL REFERENCES Providers(id),
  owned_modules_json TEXT NOT NULL,
  permanent_instructions TEXT NOT NULL,
  operational_state TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS AgentMemberships (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES Agents(id),
  squad_id TEXT NOT NULL REFERENCES Squads(id),
  role_in_squad TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  UNIQUE(agent_id, squad_id)
);

CREATE TABLE IF NOT EXISTS Projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  is_read_only_protected INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Waves (
  id TEXT PRIMARY KEY, -- ONDA-00 .. ONDA-19
  wave_number INTEGER NOT NULL UNIQUE CHECK(wave_number >= 0 AND wave_number <= 19),
  project_id TEXT NOT NULL REFERENCES Projects(id),
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  dependencies_json TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  evidence_summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Missions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES Projects(id),
  wave_id TEXT NOT NULL REFERENCES Waves(id),
  title TEXT NOT NULL,
  step_number INTEGER NOT NULL CHECK(step_number >= 1 AND step_number <= 23),
  step_code TEXT NOT NULL,
  status TEXT NOT NULL,
  executor_provider_id TEXT NOT NULL REFERENCES Providers(id),
  executor_agent_id TEXT NOT NULL REFERENCES Agents(id),
  auditor_agent_id TEXT NOT NULL REFERENCES Agents(id),
  priority TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL,
  preflight_json TEXT NOT NULL,
  approved_sha TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(executor_agent_id <> auditor_agent_id)
);

CREATE TABLE IF NOT EXISTS Tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  assigned_agent_id TEXT NOT NULL REFERENCES Agents(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS MissionDependencies (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  depends_on_mission_id TEXT NOT NULL REFERENCES Missions(id),
  dependency_type TEXT NOT NULL,
  UNIQUE(mission_id, depends_on_mission_id)
);

CREATE TABLE IF NOT EXISTS Prompts (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES Waves(id),
  target_provider_id TEXT NOT NULL REFERENCES Providers(id),
  target_squad_id TEXT NOT NULL REFERENCES Squads(id),
  title TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PromptVersions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES Prompts(id),
  version_number INTEGER NOT NULL,
  objective TEXT NOT NULL,
  scope_modules_json TEXT NOT NULL,
  constitutional_constraints_json TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL,
  prompt_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(prompt_id, version_number)
);

CREATE TABLE IF NOT EXISTS Checklists (
  id TEXT PRIMARY KEY,
  wave_id TEXT NOT NULL REFERENCES Waves(id),
  mission_id TEXT REFERENCES Missions(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ChecklistItems (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES Checklists(id),
  label TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  verified_by TEXT,
  evidence_note TEXT
);

CREATE TABLE IF NOT EXISTS Environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL, -- NUVEM, LOCAL_WINDOWS, GITHUB
  reserved_port INTEGER UNIQUE,
  test_db_schema TEXT UNIQUE,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Worktrees (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL UNIQUE REFERENCES Missions(id),
  worktree_path TEXT NOT NULL UNIQUE,
  isolated_node_modules_path TEXT NOT NULL UNIQUE,
  has_unsafe_symlinks INTEGER NOT NULL DEFAULT 0 CHECK(has_unsafe_symlinks = 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Branches (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL UNIQUE REFERENCES Missions(id),
  branch_name TEXT NOT NULL UNIQUE,
  base_sha TEXT NOT NULL,
  current_head_sha TEXT NOT NULL,
  is_protected INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ResourceLeases (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  resource_key TEXT NOT NULL UNIQUE,
  lease_owner TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Executions (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  provider_id TEXT NOT NULL REFERENCES Providers(id),
  agent_id TEXT NOT NULL REFERENCES Agents(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  output_sha TEXT,
  exit_code INTEGER,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  mission_id TEXT REFERENCES Missions(id),
  wave_id TEXT REFERENCES Waves(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ConversationParticipants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES Conversations(id),
  participant_type TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  UNIQUE(conversation_id, participant_type, participant_id)
);

CREATE TABLE IF NOT EXISTS Messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES Conversations(id),
  author_type TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  priority TEXT NOT NULL,
  message_kind TEXT NOT NULL,
  content TEXT NOT NULL,
  code_snippet TEXT,
  related_sha TEXT,
  processing_state TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES Messages(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Audits (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  original_executor_id TEXT NOT NULL REFERENCES Agents(id),
  responsible_auditor_id TEXT NOT NULL REFERENCES Agents(id),
  audited_sha TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT NOT NULL,
  final_verdict TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(original_executor_id <> responsible_auditor_id)
);

CREATE TABLE IF NOT EXISTS AuditFindings (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES Audits(id),
  category TEXT NOT NULL, -- FALHA_PRODUTO, FALHA_AMBIENTAL, LIMITACAO_EVIDENCIA
  severity TEXT NOT NULL,
  file_or_module TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  required_fix TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Evidence (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  audit_id TEXT REFERENCES Audits(id),
  command_executed TEXT NOT NULL,
  exit_code INTEGER,
  artifact_ref TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS QualityGates (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  gate_type TEXT NOT NULL, -- TYPECHECK, LINT, BUILD, UNIT_TEST, E2E, SECURITY
  executed INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER,
  status TEXT NOT NULL,
  evaluated_sha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PullRequests (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  branch_id TEXT NOT NULL REFERENCES Branches(id),
  target_repo TEXT NOT NULL,
  approved_sha TEXT NOT NULL,
  status TEXT NOT NULL,
  human_authorized INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Approvals (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  approver_id TEXT NOT NULL,
  approver_role TEXT NOT NULL,
  approved_sha TEXT NOT NULL,
  decision TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Handoffs (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES Missions(id),
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  payload_sha TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Memories (
  id TEXT PRIMARY KEY,
  memory_level TEXT NOT NULL, -- 10 Níveis oficiais
  entity_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  provenance TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS KnowledgeDocuments (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Automations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  coordinator_provider_id TEXT NOT NULL REFERENCES Providers(id),
  target_environment TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS AutomationRuns (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES Automations(id),
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Notifications (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Runners (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  os_platform TEXT NOT NULL,
  connection_mode TEXT NOT NULL DEFAULT 'OUTBOUND_AUTHENTICATED_ONLY',
  is_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS RunnerHeartbeats (
  id TEXT PRIMARY KEY,
  runner_id TEXT NOT NULL REFERENCES Runners(id),
  drive_c_free_gb REAL,
  drive_d_free_gb REAL,
  active_worktrees_count INTEGER NOT NULL DEFAULT 0,
  reported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS UsageRecords (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES Providers(id),
  account_id TEXT NOT NULL REFERENCES ProviderAccounts(id),
  mission_id TEXT REFERENCES Missions(id),
  additional_cost_brl REAL NOT NULL DEFAULT 0.0 CHECK(additional_cost_brl = 0.0),
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS CostPolicies (
  id TEXT PRIMARY KEY,
  max_additional_spend_brl REAL NOT NULL DEFAULT 0.0 CHECK(max_additional_spend_brl = 0.0),
  block_auto_paid_api INTEGER NOT NULL DEFAULT 1,
  block_account_rotation_abuse INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS GovernancePolicies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  rule_body TEXT NOT NULL,
  enforced_technically INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS AuditLogs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  sha_or_ref TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_wave ON Missions(wave_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON Missions(status);
CREATE INDEX IF NOT EXISTS idx_audits_mission_sha ON Audits(mission_id, audited_sha);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON Messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_memories_level_ref ON Memories(memory_level, entity_ref);
