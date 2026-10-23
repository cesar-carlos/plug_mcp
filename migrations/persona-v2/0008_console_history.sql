-- Additive metadata only; historical authors/versions remain unknown.
ALTER TABLE audit_v2 ADD COLUMN previous_version integer CHECK (previous_version > 0);
ALTER TABLE audit_v2 ADD COLUMN resource_version integer CHECK (resource_version > 0);
ALTER TABLE audit_v2 ALTER COLUMN responsavel_id SET DEFAULT
  nullif(current_setting('persona_v2.owner_id',true),'')::uuid;
CREATE INDEX audit_v2_history_idx ON audit_v2(persona_id,created_at DESC,id DESC);
