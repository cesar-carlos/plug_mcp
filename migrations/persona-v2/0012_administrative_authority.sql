-- No existing delegation acquires new powers during upgrade.
ALTER TABLE responsavel_delegacao_v2 ADD COLUMN administrative jsonb NOT NULL
  DEFAULT '["gerenciar_fontes"]'::jsonb;
ALTER TABLE responsavel_delegacao_v2 ADD CONSTRAINT delegation_administrative_ceiling
  CHECK (jsonb_typeof(administrative)='array' AND jsonb_array_length(administrative) BETWEEN 1 AND 5
    AND administrative <@ '["treinar","publicar","gerenciar_fontes","gerenciar_tokens","gerenciar_integracoes"]'::jsonb);
ALTER TABLE publicacao_preview_v2 ADD COLUMN administrative_context text;
ALTER TABLE audit_v2 ADD COLUMN actor_token_id uuid;
ALTER TABLE audit_v2 ADD COLUMN actor_grant_id uuid;
ALTER TABLE audit_v2 ADD CONSTRAINT audit_actor_token_fk FOREIGN KEY(persona_id,actor_token_id)
  REFERENCES persona_token(persona_id,id);
ALTER TABLE audit_v2 ADD CONSTRAINT audit_actor_grant_fk FOREIGN KEY(persona_id,actor_grant_id)
  REFERENCES oauth_concessao_v2(persona_id,id);
ALTER TABLE audit_v2 ALTER COLUMN actor_token_id SET DEFAULT
  nullif(current_setting('persona_v2.actor_token_id',true),'')::uuid;
ALTER TABLE audit_v2 ALTER COLUMN actor_grant_id SET DEFAULT
  nullif(current_setting('persona_v2.actor_grant_id',true),'')::uuid;
