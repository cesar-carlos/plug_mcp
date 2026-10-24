ALTER TABLE audit_v2 ADD COLUMN query_reuse_kind text
 CHECK (query_reuse_kind IN ('fresh','cache','singleflight'));
CREATE INDEX query_reuse_pending_source ON operacao_v2(fonte_id)
 WHERE estado IN ('executando','cancelamento_solicitado','resultado_desconhecido');
CREATE INDEX query_reuse_physical_bindings ON fonte(fonte_fisica_id,id,persona_id);
