-- Add native proof without trusting or rewriting provisional identities from earlier development builds.
ALTER TABLE fonte ADD COLUMN identity_hash text CHECK (identity_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE fonte ADD COLUMN identity_verified_at timestamptz;
ALTER TABLE fonte ADD CONSTRAINT fonte_identity_pair CHECK ((identity_hash IS NULL) = (identity_verified_at IS NULL));
-- Old sources require explicit registration with live discovery, never automatic rebinding.
UPDATE fonte SET ativa=false, authorization_version=authorization_version+1 WHERE identity_hash IS NULL AND ativa;
UPDATE fonte_fisica SET cache_revision=cache_revision+1 WHERE id IN (SELECT fonte_fisica_id FROM fonte WHERE identity_hash IS NULL);
WITH RECURSIVE affected(persona_id,publicacao_id) AS (
  SELECT p.persona_id,p.publicacao_id FROM publicacao_fonte p
  JOIN fonte f ON f.persona_id=p.persona_id AND f.id=p.fonte_id WHERE f.identity_hash IS NULL
  UNION SELECT d.persona_id,d.publicacao_id FROM publicacao_dependencia d
  JOIN affected a ON a.persona_id=d.persona_id AND a.publicacao_id=d.dependencia_id
)
INSERT INTO publicacao_suspensao(persona_id,publicacao_id,motivo)
SELECT persona_id,publicacao_id,'source_identity_required' FROM affected
ON CONFLICT DO NOTHING;
