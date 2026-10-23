-- Expiry maintenance never changes grants, publications or operation journals.
CREATE TABLE persona_ephemeral_worker_lease_v2 (
  name text PRIMARY KEY CHECK(name='ephemeral-cleanup'),
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX physical_profile_preview_expiry_idx ON physical_profile_preview_v2(expires_at);
CREATE INDEX knowledge_curation_preview_expiry_idx ON knowledge_curation_preview_v2(expires_at);
CREATE INDEX physical_curation_preview_expiry_idx ON physical_curation_preview_v2(expires_at);
CREATE INDEX structure_preview_expiry_idx ON structure_preview_v2(expires_at);
