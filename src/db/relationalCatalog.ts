/**
 * Catálogo das tabelas de domínio do B360-AOC.
 *
 * Os testes aplicam migrations/0001..N num SQLite local e exigem que o
 * conjunto de tabelas (exceto schema_migrations) seja exatamente esta lista.
 *
 * 0001 cria as 44 primeiras. A contagem antiga de 45 tratava ImportedConversations
 * como se já estivesse na 0001. Ela entra na 0002, junto com Outbox e EventLog.
 * Total de domínio: 47. schema_migrations é controle do runner e não entra nas 47.
 * Nenhuma tabela recebe tenant_id enquanto a decisão multi-tenant estiver pendente.
 */
export const RELATIONAL_TABLES = [
  'Users',
  'Roles',
  'Permissions',
  'Providers',
  'ProviderAccounts',
  'Squads',
  'Agents',
  'AgentMemberships',
  'Projects',
  'Waves',
  'Missions',
  'Tasks',
  'MissionDependencies',
  'Prompts',
  'PromptVersions',
  'Checklists',
  'ChecklistItems',
  'Environments',
  'Worktrees',
  'Branches',
  'ResourceLeases',
  'Executions',
  'Conversations',
  'ConversationParticipants',
  'Messages',
  'Attachments',
  'Audits',
  'AuditFindings',
  'Evidence',
  'QualityGates',
  'PullRequests',
  'Approvals',
  'Handoffs',
  'Memories',
  'KnowledgeDocuments',
  'Automations',
  'AutomationRuns',
  'Notifications',
  'Runners',
  'RunnerHeartbeats',
  'UsageRecords',
  'CostPolicies',
  'GovernancePolicies',
  'AuditLogs',
  'ImportedConversations',
  'Outbox',
  'EventLog',
] as const;

export const RELATIONAL_TABLE_COUNT = RELATIONAL_TABLES.length;

export const TABLES_INTRODUCED_BY_0001 = RELATIONAL_TABLES.slice(0, 44);
export const TABLES_INTRODUCED_BY_0002 = RELATIONAL_TABLES.slice(44);
