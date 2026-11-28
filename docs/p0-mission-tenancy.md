# P0 — Isolamento de missões (candidato)

Migration incremental 0003, sem reescrever 0001/0002. Filtra leitura/escrita por tenant de AuthContext, sem tenant default. Registros antigos sem atribuição são preservados e ficam inacessíveis. Fixtures explicitamente sintéticas recebem tenant. O escopo é exclusivamente o adapter de missões; não há isolamento global, emissão autenticada integrada ou backfill de dados reais. Revisão, testes e autorização de migração ainda necessários.
