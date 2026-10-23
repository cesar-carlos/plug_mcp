-- persona-v2 is a fresh generation. Never run this file on the legacy MCP database.
CREATE TABLE mcp_schema_generation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation text NOT NULL CHECK (generation = 'persona-v2'),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO mcp_schema_generation(generation) VALUES ('persona-v2');

CREATE TABLE responsavel (
  id uuid PRIMARY KEY,
  hub_origin text NOT NULL,
  hub_client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_origin, hub_client_id)
);
CREATE TABLE persona (
  id uuid PRIMARY KEY,
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
  especialidade text NOT NULL,
  instrucoes text NOT NULL DEFAULT '',
  ativa boolean NOT NULL DEFAULT true,
  authorization_version integer NOT NULL DEFAULT 1 CHECK (authorization_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persona_responsavel_idx ON persona(responsavel_id);
-- No credentials, training or results on a physical identity.
CREATE TABLE fonte_fisica (
  id uuid PRIMARY KEY,
  identity_hash text NOT NULL UNIQUE,
  cache_revision bigint NOT NULL DEFAULT 1 CHECK (cache_revision > 0)
);
CREATE TABLE fonte_credencial (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  email_enc text NOT NULL,
  senha_enc text NOT NULL,
  client_token_enc text NOT NULL,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  UNIQUE (persona_id,id)
);
CREATE TABLE fonte (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  fonte_fisica_id uuid NOT NULL REFERENCES fonte_fisica(id),
  credencial_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  banco text NOT NULL CHECK (length(banco) > 0),
  dialeto text NOT NULL CHECK (dialeto IN ('postgres','mssql','sybase','firebird')),
  nome text NOT NULL,
  finalidade text NOT NULL,
  ambiente text NOT NULL,
  recortes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(recortes) = 'array'),
  ativa boolean NOT NULL DEFAULT true,
  authorization_version integer NOT NULL DEFAULT 1 CHECK (authorization_version > 0),
  UNIQUE (persona_id,id),
  FOREIGN KEY (persona_id,credencial_id) REFERENCES fonte_credencial(persona_id,id)
);
CREATE INDEX fonte_fisica_vinculos_idx ON fonte(fonte_fisica_id);
CREATE TABLE persona_token (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  nome text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz,
  revoked_at timestamptz,
  authorization_version integer NOT NULL DEFAULT 1 CHECK (authorization_version > 0),
  permissoes jsonb NOT NULL CHECK (jsonb_typeof(permissoes) = 'object'),
  delegacao jsonb NOT NULL CHECK (jsonb_typeof(delegacao) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_id,id)
);
CREATE TABLE integracao (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  tipo text NOT NULL CHECK (tipo IN ('rest','mcp_http')),
  nome text NOT NULL,
  destino text NOT NULL,
  credencial_enc text NOT NULL,
  credencial_versao integer NOT NULL DEFAULT 1 CHECK (credencial_versao > 0),
  ativa boolean NOT NULL DEFAULT true,
  UNIQUE (persona_id,id)
);
CREATE TABLE integracao_operacao (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  integracao_id uuid NOT NULL,
  nome text NOT NULL,
  contrato jsonb NOT NULL,
  contrato_hash text NOT NULL,
  efeito text NOT NULL CHECK (efeito IN ('consulta','acao')),
  ativa boolean NOT NULL DEFAULT false,
  UNIQUE (persona_id,id),
  FOREIGN KEY (persona_id,integracao_id) REFERENCES integracao(persona_id,id)
);
CREATE TABLE skill_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tipo text NOT NULL CHECK (tipo IN ('consulta','cruzamento','operacao_sql','acao_externa')),
  nome text NOT NULL,
  revisao integer NOT NULL DEFAULT 1 CHECK (revisao > 0),
  rascunho jsonb NOT NULL,
  publicacao_ativa_id uuid,
  UNIQUE (persona_id,slug),
  UNIQUE (persona_id,id)
);
CREATE TABLE publicacao (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  revisao integer NOT NULL CHECK (revisao > 0),
  pacote jsonb NOT NULL,
  pacote_hash text NOT NULL CHECK (pacote_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_id,id),
  UNIQUE (persona_id,skill_id,id),
  FOREIGN KEY (persona_id,skill_id) REFERENCES skill_v2(persona_id,id)
);
ALTER TABLE skill_v2 ADD FOREIGN KEY (persona_id,id,publicacao_ativa_id)
  REFERENCES publicacao(persona_id,skill_id,id);
CREATE FUNCTION refuse_publication_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published packages are immutable';
END $$;
CREATE TRIGGER publicacao_immutable BEFORE UPDATE OR DELETE ON publicacao
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE TABLE publicacao_suspensao (
  persona_id uuid NOT NULL,
  publicacao_id uuid PRIMARY KEY,
  motivo text NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id)
);
CREATE TABLE publicacao_fonte (
  persona_id uuid NOT NULL,
  publicacao_id uuid NOT NULL,
  fonte_id uuid NOT NULL,
  fonte_version integer NOT NULL CHECK (fonte_version > 0),
  PRIMARY KEY (publicacao_id,fonte_id),
  FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  FOREIGN KEY (persona_id,fonte_id) REFERENCES fonte(persona_id,id)
);
CREATE TABLE publicacao_dependencia (
  persona_id uuid NOT NULL,
  publicacao_id uuid NOT NULL,
  dependencia_id uuid NOT NULL,
  PRIMARY KEY (publicacao_id,dependencia_id),
  CHECK (publicacao_id <> dependencia_id),
  FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  FOREIGN KEY (persona_id,dependencia_id) REFERENCES publicacao(persona_id,id)
);
CREATE TABLE publicacao_integracao (
  persona_id uuid NOT NULL,
  publicacao_id uuid NOT NULL,
  operacao_id uuid NOT NULL,
  contrato_hash text NOT NULL,
  PRIMARY KEY (publicacao_id,operacao_id),
  FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  FOREIGN KEY (persona_id,operacao_id) REFERENCES integracao_operacao(persona_id,id)
);
CREATE TABLE conhecimento_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  fonte_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('tabela','coluna','relacionamento','regra','anotacao')),
  identidade_fisica jsonb,
  titulo text NOT NULL,
  descricao text NOT NULL,
  conteudo jsonb NOT NULL,
  classificacao text NOT NULL CHECK (classificacao IN ('inferido','livre','sensivel','pessoal','segredo')),
  governanca jsonb NOT NULL DEFAULT '{}',
  busca tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',coalesce(titulo,'') || ' ' || coalesce(descricao,''))
  ) STORED,
  UNIQUE (persona_id,id),
  FOREIGN KEY (persona_id,fonte_id) REFERENCES fonte(persona_id,id)
);
CREATE INDEX conhecimento_v2_busca_idx ON conhecimento_v2 USING gin(busca);
CREATE INDEX conhecimento_v2_fonte_idx ON conhecimento_v2(persona_id,fonte_id);
CREATE TABLE curadoria_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  skill_id uuid,
  publicacao_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('candidata','consulta_aprendida','feedback','template','dataset','revisao')),
  ativa boolean NOT NULL DEFAULT false,
  conteudo jsonb NOT NULL,
  expires_at timestamptz,
  UNIQUE (persona_id,id),
  FOREIGN KEY (persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
  FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  FOREIGN KEY (persona_id,skill_id,publicacao_id) REFERENCES publicacao(persona_id,skill_id,id)
);
CREATE TABLE caso_teste_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  caso jsonb NOT NULL,
  UNIQUE (persona_id,id),
  FOREIGN KEY (persona_id,skill_id) REFERENCES skill_v2(persona_id,id)
);
CREATE TABLE relatorio_teste_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  revisao integer NOT NULL,
  pacote_hash text NOT NULL,
  runner_id text NOT NULL,
  aprovado boolean NOT NULL,
  resultados jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (persona_id,skill_id) REFERENCES skill_v2(persona_id,id)
);
CREATE TABLE operacao_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  token_id uuid NOT NULL,
  publicacao_id uuid NOT NULL,
  fonte_id uuid,
  integracao_operacao_id uuid,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  authorization_snapshot jsonb NOT NULL,
  estado text NOT NULL CHECK (estado IN (
    'preparada','aprovacao_pendente','aprovada','executando','concluida','recusada',
    'expirada','rollback_confirmado','cancelamento_solicitado','cancelada','resultado_desconhecido'
  )),
  exige_aprovacao boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  payload_enc text,
  payload_purge_at timestamptz,
  comprovante jsonb,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_id,id),
  CHECK ((fonte_id IS NULL) <> (integracao_operacao_id IS NULL)),
  FOREIGN KEY (persona_id,token_id) REFERENCES persona_token(persona_id,id),
  FOREIGN KEY (persona_id,publicacao_id) REFERENCES publicacao(persona_id,id),
  FOREIGN KEY (persona_id,fonte_id) REFERENCES fonte(persona_id,id),
  FOREIGN KEY (persona_id,integracao_operacao_id) REFERENCES integracao_operacao(persona_id,id)
);
CREATE INDEX operacao_v2_pendente_idx ON operacao_v2(persona_id,estado,created_at);
CREATE TABLE aprovacao_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  operacao_id uuid NOT NULL UNIQUE,
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (persona_id,operacao_id) REFERENCES operacao_v2(persona_id,id)
);
CREATE FUNCTION validate_operation_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM persona p JOIN operacao_v2 o ON o.persona_id=p.id
    WHERE p.id=NEW.persona_id AND p.responsavel_id=NEW.responsavel_id
    AND o.id=NEW.operacao_id AND o.fingerprint=NEW.fingerprint
    AND NEW.expires_at<=o.expires_at) THEN
    RAISE EXCEPTION 'Approval owner, fingerprint or expiry mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aprovacao_v2_owner BEFORE INSERT OR UPDATE ON aprovacao_v2
  FOR EACH ROW EXECUTE FUNCTION validate_operation_owner();
CREATE TABLE audit_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  token_id uuid,
  fonte_id uuid,
  operacao_id uuid,
  evento text NOT NULL,
  origem text NOT NULL,
  sucesso boolean NOT NULL,
  duracao_ms integer CHECK (duracao_ms >= 0),
  linhas integer CHECK (linhas >= 0),
  etapa integer CHECK (etapa >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (persona_id,token_id) REFERENCES persona_token(persona_id,id),
  FOREIGN KEY (persona_id,fonte_id) REFERENCES fonte(persona_id,id),
  FOREIGN KEY (persona_id,operacao_id) REFERENCES operacao_v2(persona_id,id)
);
CREATE INDEX audit_v2_persona_created_idx ON audit_v2(persona_id,created_at);
CREATE TABLE outbox_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES persona(id),
  evento text NOT NULL,
  aggregate_ids uuid[] NOT NULL,
  destino_enc text NOT NULL,
  segredo_enc text NOT NULL,
  lease_owner text,
  lease_until timestamptz,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  estado text NOT NULL CHECK (estado IN ('pendente','entregue','dead_letter')),
  available_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE setup_v2 (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  persona_id uuid REFERENCES persona(id),
  token_id uuid,
  finalidade text NOT NULL,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  contexto_enc text NOT NULL,
  CHECK (token_id IS NULL OR persona_id IS NOT NULL),
  FOREIGN KEY (persona_id,token_id) REFERENCES persona_token(persona_id,id)
);
CREATE TABLE oauth_concessao_v2 (
  id uuid PRIMARY KEY,
  persona_id uuid NOT NULL,
  token_id uuid NOT NULL,
  token_version integer NOT NULL,
  permissoes jsonb NOT NULL,
  client_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (persona_id,id),
  FOREIGN KEY (persona_id,token_id) REFERENCES persona_token(persona_id,id)
);
CREATE TABLE oauth_registro_v2 (
  id_hash text PRIMARY KEY,
  persona_id uuid,
  concessao_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('transaction','code','access_token','refresh_token')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  conteudo_enc text NOT NULL,
  CHECK (concessao_id IS NULL OR persona_id IS NOT NULL),
  CHECK (tipo='transaction' OR (persona_id IS NOT NULL AND concessao_id IS NOT NULL)),
  FOREIGN KEY (persona_id,concessao_id) REFERENCES oauth_concessao_v2(persona_id,id)
);
