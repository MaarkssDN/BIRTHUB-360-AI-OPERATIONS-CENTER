# Schema relacional local

Total de tabelas de domínio: **47**. `schema_migrations` é o controle do runner e não entra nessa conta. Nenhuma tabela tem `tenant_id`. As migrations não têm `INSERT`. O único seed é o JSON sintético de `npm run db:seed`.

## Contagem

| Arquivo | Tabelas |
| --- | --- |
| `migrations/0001_initial_schema.sql` | 44, da `Users` até `AuditLogs` |
| `migrations/0002_imported_conversations_outbox_event_log.sql` | `ImportedConversations`, `Outbox`, `EventLog` |

A lista canônica, na ordem de criação, está em `src/db/relationalCatalog.ts`.

A contagem antiga de 45 estava errada: a `0001` de origem tinha 44 `CREATE TABLE`. A entidade que faltava era `ImportedConversations`. `Outbox` e `EventLog` foram pedidas junto. `GovernanceState` não é uma tabela ausente.

No repositório antigo a migration das três tabelas era a `0003`, porque a `0002` de lá era seed. Esse seed não foi portado: tinha dados reais. Aqui a sequência limpa é `0001` e `0002`.

## O que foi reconstruído da `0001`

O repositório antigo não está acessível. O texto veio do transcript do agente que leu `migrations/0001_initial_schema.sql` nesse repo.

- O leitor reportou `totalLines: 457`.
- A primeira leitura devolveu 80 linhas e parou na linha `CREATE TABLE IF NOT EXISTS AgentMemberships (`.
- A segunda leitura devolveu 377 linhas, começando nessa mesma linha e terminando no índice `idx_memories_level_ref`.
- A junção tirou essa linha duplicada. Ficaram 456 linhas de conteúdo mais a quebra de linha final.

A diferença de uma linha para 457 é a linha vazia que o leitor conta quando o arquivo termina em newline. Não apareceu outro buraco: os 44 nomes de `CREATE TABLE` batem, na mesma ordem, com o catálogo que aquele agente listou, e o `node:sqlite` aplica o arquivo. Não havia `INSERT`, endereço de e-mail, id de pasta do Drive nem segredo no trecho recuperado.

O cabeçalho de origem dizia "45 ENTIDADES". Neste arquivo novo o comentário diz 44. Isso não é uma edição da `0001` histórica; é o arquivo criado aqui.

Não foi inventada coluna. A tabela `Users` recuperada tem `id`, `email`, `display_name`, `is_human_orchestrator` e `created_at`. Não tem `role_id` nem `is_active`. No repo antigo o contrato Zod tinha esses dois campos e o drift ficou registrado, sem correção. Este repositório não tem esse contrato Zod, e a coluna não foi acrescentada.

## `0002`

O SQL da `0002` é o da `0003` do transcript (diff completo, 92 linhas de SQL), com o cabeçalho ajustado para a numeração nova.

- `ImportedConversations`: `content_fingerprint` único. Arrays extraídos em colunas `*_json`, sem FKs.
- `Outbox`: `idempotency_key` único, status, `attempt_count`, timestamps e o índice parcial `idx_outbox_pending_dispatch` para `status = 'PENDENTE'`.
- `EventLog`: append-only. Triggers abortam `UPDATE` e `DELETE`. Ordem por `sequence_no`.

## Runner

`src/db/migrate.ts` abre um SQLite em memória ou num arquivo com `node:sqlite`. Não há dependência nova. Cada arquivo entra numa transação junto com o registro em `schema_migrations` (versão, nome, SHA-256, horário). A segunda execução com o mesmo checksum não reaplica. Checksum diferente falha.

`npm run migrate:local` sem argumento usa memória e imprime o resumo. Com um caminho, grava nesse arquivo. URL, `d1:`, wrangler e Cloudflare são recusados. Nada é aplicado em D1 ou em outro ambiente remoto.

## `tenant_id`

A coluna não existe. Quando a decisão multi-tenant sair, uma migration posterior acrescenta a coluna, e o filtro usa só o `tenantId` do `AuthContext` — nunca um valor vindo do request. Esse ponto de extensão fica na camada de repositório; esta migration não o antecipa.
