-- Credential setup records metadata only; it never activates an integration.
ALTER TABLE integracao ALTER COLUMN ativa SET DEFAULT false;
ALTER TABLE audit_v2 ADD COLUMN integracao_id uuid;
ALTER TABLE audit_v2 ADD CONSTRAINT audit_integration_persona_fk
  FOREIGN KEY (persona_id,integracao_id) REFERENCES integracao(persona_id,id);
