-- Preserva linhas legadas sem atribuição automática. NULL não é visível por repository.
ALTER TABLE Missions ADD COLUMN tenant_id TEXT CHECK (tenant_id IS NULL OR length(trim(tenant_id)) > 0);
CREATE INDEX idx_missions_tenant_id ON Missions(tenant_id, id);
