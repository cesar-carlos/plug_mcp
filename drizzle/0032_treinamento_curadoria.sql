ALTER TABLE consulta_aprendida ADD COLUMN versao integer NOT NULL DEFAULT 1;
ALTER TABLE consulta_aprendida ADD COLUMN fingerprint text;
ALTER TABLE consulta_aprendida ADD COLUMN motivo_inativacao text;
CREATE UNIQUE INDEX consulta_aprendida_fingerprint_uidx ON consulta_aprendida(acesso_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE TABLE treinamento_revisao (
 id uuid NOT NULL, acesso_id uuid NOT NULL REFERENCES acesso(id) ON DELETE CASCADE,
 skill_id uuid REFERENCES skill(id) ON DELETE CASCADE, tipo text NOT NULL CHECK (tipo IN ('caso','relatorio','feedback')),
 versao integer NOT NULL, conteudo jsonb NOT NULL, autor_usuario_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (id,versao)
);
CREATE INDEX treinamento_revisao_acesso_idx ON treinamento_revisao(acesso_id, tipo, skill_id);
CREATE FUNCTION treinamento_revisao_immutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Revisoes de treinamento sao imutaveis'; END; $$;
CREATE TRIGGER treinamento_revisao_immutavel BEFORE UPDATE ON treinamento_revisao FOR EACH ROW EXECUTE FUNCTION treinamento_revisao_immutavel();
