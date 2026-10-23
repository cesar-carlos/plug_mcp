-- Shared structure is opt-in. Existing private skills and publications are untouched.
CREATE TABLE knowledge_catalog_v2 (
  id uuid PRIMARY KEY,
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 200),
  authorization_version integer NOT NULL DEFAULT 1 CHECK (authorization_version > 0)
);
CREATE TABLE knowledge_member_v2 (
  catalogo_id uuid NOT NULL REFERENCES knowledge_catalog_v2(id),
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  papel text NOT NULL CHECK (papel IN ('administrator','curator','contributor','reader')),
  PRIMARY KEY (catalogo_id,responsavel_id)
);
CREATE INDEX knowledge_member_owner_idx ON knowledge_member_v2(responsavel_id,catalogo_id);
CREATE TABLE structure_pattern_v2 (
  id uuid PRIMARY KEY,
  catalogo_id uuid NOT NULL REFERENCES knowledge_catalog_v2(id),
  slug text NOT NULL,
  nome text NOT NULL,
  revisao integer NOT NULL CHECK (revisao > 0),
  rascunho jsonb NOT NULL,
  publicacao_ativa_id uuid,
  UNIQUE (catalogo_id,id),
  UNIQUE (catalogo_id,slug)
);
CREATE TABLE structure_publication_v2 (
  id uuid PRIMARY KEY,
  catalogo_id uuid NOT NULL,
  padrao_id uuid NOT NULL,
  revisao integer NOT NULL CHECK (revisao > 0),
  pacote jsonb NOT NULL,
  pacote_hash text NOT NULL CHECK (pacote_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz NOT NULL,
  UNIQUE (catalogo_id,id),
  UNIQUE (catalogo_id,padrao_id,id),
  FOREIGN KEY (catalogo_id,padrao_id) REFERENCES structure_pattern_v2(catalogo_id,id)
);
ALTER TABLE structure_pattern_v2 ADD CONSTRAINT structure_pattern_active_fk
  FOREIGN KEY (catalogo_id,id,publicacao_ativa_id)
  REFERENCES structure_publication_v2(catalogo_id,padrao_id,id);
CREATE FUNCTION reject_shared_structure_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published shared structure is immutable';
END;
$$;
CREATE TRIGGER structure_publication_immutable BEFORE UPDATE OR DELETE ON structure_publication_v2
  FOR EACH ROW EXECUTE FUNCTION reject_shared_structure_mutation();
CREATE TABLE structure_suspension_v2 (
  catalogo_id uuid NOT NULL,
  publicacao_id uuid PRIMARY KEY,
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  suspended_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (catalogo_id,publicacao_id) REFERENCES structure_publication_v2(catalogo_id,id)
);
CREATE TABLE structure_preview_v2 (
  hash text PRIMARY KEY CHECK (hash ~ '^[a-f0-9]{64}$'),
  catalogo_id uuid NOT NULL,
  padrao_id uuid NOT NULL,
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  revisao integer NOT NULL,
  catalog_version integer NOT NULL,
  pacote_hash text NOT NULL CHECK (pacote_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY (catalogo_id,padrao_id) REFERENCES structure_pattern_v2(catalogo_id,id)
);
CREATE TABLE knowledge_audit_v2 (
  id uuid PRIMARY KEY,
  catalogo_id uuid NOT NULL REFERENCES knowledge_catalog_v2(id),
  responsavel_id uuid NOT NULL REFERENCES responsavel(id),
  evento text NOT NULL,
  recurso_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
