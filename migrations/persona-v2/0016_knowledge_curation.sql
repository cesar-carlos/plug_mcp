-- Explicit proposals only. No capture, promotion, publication or permission backfill.
ALTER TABLE persona ADD CONSTRAINT persona_owner_pair UNIQUE(id,responsavel_id);
CREATE TABLE knowledge_proposal_v2 (
 id uuid PRIMARY KEY,
 catalog_id uuid NOT NULL,
 pattern_id uuid NOT NULL,
 base_publication_id uuid NOT NULL,
 base_hash text NOT NULL CHECK(base_hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid NOT NULL REFERENCES responsavel(id),
 origin text NOT NULL CHECK(origin IN ('console','mcp')),
 persona_id uuid,
 token_id uuid,
 grant_id uuid,
 source_id uuid,
 skill_id uuid,
 summary text NOT NULL CHECK(length(summary) BETWEEN 1 AND 2000),
 change jsonb NOT NULL CHECK(jsonb_typeof(change)='object'),
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','incorporated','rejected')),
 created_at timestamptz NOT NULL,
 reviewer_id uuid REFERENCES responsavel(id),
 reviewed_at timestamptz,
 reason text,
 UNIQUE(catalog_id,id),
 FOREIGN KEY(catalog_id,pattern_id,base_publication_id) REFERENCES structure_publication_v2(catalogo_id,padrao_id,id),
 FOREIGN KEY(persona_id,owner_id) REFERENCES persona(id,responsavel_id),
 FOREIGN KEY(persona_id,token_id) REFERENCES persona_token(persona_id,id),
 FOREIGN KEY(persona_id,source_id) REFERENCES fonte(persona_id,id),
 FOREIGN KEY(persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
 CHECK((origin='console' AND persona_id IS NULL AND token_id IS NULL AND grant_id IS NULL AND source_id IS NULL AND skill_id IS NULL)
    OR (origin='mcp' AND persona_id IS NOT NULL AND token_id IS NOT NULL AND source_id IS NOT NULL AND skill_id IS NOT NULL)),
 CHECK((state='pending' AND reviewer_id IS NULL AND reviewed_at IS NULL AND reason IS NULL)
    OR (state<>'pending' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(reason) BETWEEN 1 AND 2000))
);
CREATE INDEX knowledge_proposal_catalog_idx ON knowledge_proposal_v2(catalog_id,id DESC);
CREATE INDEX knowledge_proposal_owner_idx ON knowledge_proposal_v2(catalog_id,owner_id,id DESC);
CREATE FUNCTION preserve_knowledge_proposal_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Knowledge proposal provenance is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['version','state','reviewer_id','reviewed_at','reason']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['version','state','reviewer_id','reviewed_at','reason']) OR
    OLD.state<>'pending' OR NEW.state='pending' OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'Knowledge proposal provenance or terminal decision is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER knowledge_proposal_immutable BEFORE UPDATE OR DELETE ON knowledge_proposal_v2
 FOR EACH ROW EXECUTE FUNCTION preserve_knowledge_proposal_v2();
CREATE TABLE knowledge_curation_preview_v2 (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 catalog_id uuid NOT NULL,
 proposal_id uuid NOT NULL,
 proposal_version integer NOT NULL,
 pattern_revision integer NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 catalog_version integer NOT NULL,
 owner_id uuid NOT NULL REFERENCES responsavel(id),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 FOREIGN KEY(catalog_id,proposal_id) REFERENCES knowledge_proposal_v2(catalog_id,id)
);
