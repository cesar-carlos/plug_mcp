-- Editorial feedback and explicit calendars never rewrite published snapshots.
CREATE TABLE knowledge_feedback_v2 (
 id uuid PRIMARY KEY, persona_id uuid NOT NULL, token_id uuid NOT NULL, skill_id uuid NOT NULL,
 publication_id uuid NOT NULL, publication_hash text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 state text NOT NULL DEFAULT 'aberto' CHECK(state IN ('aberto','encaminhado','encerrado')),
 proposal_id uuid, proposal_kind text CHECK(proposal_kind IN ('padrao','perfil')),
 reviewer_id uuid REFERENCES responsavel(id), reason text,
 FOREIGN KEY(persona_id,token_id) REFERENCES persona_token(persona_id,id),
 FOREIGN KEY(persona_id,skill_id,publication_id) REFERENCES publicacao(persona_id,skill_id,id),
 FOREIGN KEY(persona_id,publication_id,publication_hash) REFERENCES publicacao(persona_id,id,pacote_hash),
 CHECK(payload ?& ARRAY['id','personaId','tokenId','skillId','publicationId','publicationHash','itemId','origin','type','content','createdAt','hash']),
 CHECK(payload->>'id'=id::text AND payload->>'personaId'=persona_id::text
   AND payload->>'tokenId'=token_id::text AND payload->>'skillId'=skill_id::text
   AND payload->>'publicationId'=publication_id::text AND payload->>'publicationHash'=publication_hash),
 CHECK((state='aberto' AND reviewer_id IS NULL AND reason IS NULL AND proposal_id IS NULL AND proposal_kind IS NULL)
   OR (state='encaminhado' AND reviewer_id IS NOT NULL AND length(reason) BETWEEN 1 AND 2000 AND proposal_id IS NOT NULL AND proposal_kind IS NOT NULL)
   OR (state='encerrado' AND reviewer_id IS NOT NULL AND length(reason) BETWEEN 1 AND 2000 AND proposal_id IS NULL AND proposal_kind IS NULL))
);
CREATE INDEX knowledge_feedback_scope_idx ON knowledge_feedback_v2(persona_id,id DESC);
CREATE FUNCTION preserve_knowledge_feedback_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Feedback origin is immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['version','state','proposal_id','proposal_kind','reviewer_id','reason']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['version','state','proposal_id','proposal_kind','reviewer_id','reason'])
    OR OLD.state<>'aberto' OR NEW.state='aberto' OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'Feedback origin or terminal decision is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER knowledge_feedback_immutable BEFORE UPDATE OR DELETE ON knowledge_feedback_v2
 FOR EACH ROW EXECUTE FUNCTION preserve_knowledge_feedback_v2();
CREATE TABLE knowledge_review_v2 (
 kind text NOT NULL CHECK(kind IN ('privado','padrao','perfil')), publication_id uuid NOT NULL,
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'), persona_id uuid, catalog_id uuid,
 private_publication_id uuid, standard_publication_id uuid, profile_publication_id uuid,
 version integer NOT NULL CHECK(version>0), due_at timestamptz NOT NULL,
 owner_id uuid NOT NULL REFERENCES responsavel(id), decided_at timestamptz NOT NULL,
 decision text NOT NULL CHECK(decision IN ('configurar','revisado')), reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
 PRIMARY KEY(kind,publication_id),
 FOREIGN KEY(persona_id,private_publication_id,hash) REFERENCES publicacao(persona_id,id,pacote_hash),
 FOREIGN KEY(catalog_id,standard_publication_id) REFERENCES structure_publication_v2(catalogo_id,id),
 FOREIGN KEY(catalog_id,profile_publication_id) REFERENCES physical_profile_publication_v2(catalog_id,id),
 CHECK((kind='privado' AND persona_id IS NOT NULL AND catalog_id IS NULL AND private_publication_id IS NOT NULL AND private_publication_id=publication_id AND standard_publication_id IS NULL AND profile_publication_id IS NULL)
 OR (kind='padrao' AND persona_id IS NULL AND catalog_id IS NOT NULL AND standard_publication_id IS NOT NULL AND standard_publication_id=publication_id AND private_publication_id IS NULL AND profile_publication_id IS NULL)
 OR (kind='perfil' AND persona_id IS NULL AND catalog_id IS NOT NULL AND profile_publication_id IS NOT NULL AND profile_publication_id=publication_id AND private_publication_id IS NULL AND standard_publication_id IS NULL))
);
CREATE INDEX knowledge_review_due_idx ON knowledge_review_v2(due_at,kind,publication_id);
CREATE TABLE knowledge_review_history_v2 (
 kind text NOT NULL, publication_id uuid NOT NULL, version integer NOT NULL,
 due_at timestamptz NOT NULL, owner_id uuid NOT NULL REFERENCES responsavel(id), decided_at timestamptz NOT NULL,
 decision text NOT NULL CHECK(decision IN ('configurar','revisado')), reason text NOT NULL,
 PRIMARY KEY(kind,publication_id,version),
 FOREIGN KEY(kind,publication_id) REFERENCES knowledge_review_v2(kind,publication_id)
);
CREATE FUNCTION record_knowledge_review_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Review history is immutable'; END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW.kind,NEW.publication_id,NEW.hash,NEW.persona_id,NEW.catalog_id,NEW.private_publication_id,NEW.standard_publication_id,NEW.profile_publication_id)
   IS DISTINCT FROM ROW(OLD.kind,OLD.publication_id,OLD.hash,OLD.persona_id,OLD.catalog_id,OLD.private_publication_id,OLD.standard_publication_id,OLD.profile_publication_id)
   OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Review target or version changed'; END IF;
 INSERT INTO knowledge_review_history_v2 VALUES(NEW.kind,NEW.publication_id,NEW.version,NEW.due_at,NEW.owner_id,NEW.decided_at,NEW.decision,NEW.reason);
 RETURN NEW;
END; $$;
CREATE TRIGGER knowledge_review_record AFTER INSERT OR UPDATE ON knowledge_review_v2
 FOR EACH ROW EXECUTE FUNCTION record_knowledge_review_v2();
CREATE FUNCTION immutable_knowledge_review_history_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Review history is immutable'; END; $$;
CREATE TRIGGER knowledge_review_history_immutable BEFORE UPDATE OR DELETE ON knowledge_review_history_v2
 FOR EACH ROW EXECUTE FUNCTION immutable_knowledge_review_history_v2();
