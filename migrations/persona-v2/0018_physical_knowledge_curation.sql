-- Dedicated immutable provenance; existing standard proposals/hashes are untouched.
ALTER TABLE physical_profile_publication_v2 ADD CONSTRAINT physical_proposal_publication_pair
 UNIQUE(catalog_id,id,profile_id,physical_source_id,identity_hash,base_publication_id,hash);
CREATE TABLE physical_knowledge_proposal_v2 (
 id uuid PRIMARY KEY,
 catalog_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 profile_publication_id uuid NOT NULL,
 physical_source_id uuid NOT NULL,
 identity_hash text NOT NULL,
 base_publication_id uuid NOT NULL,
 profile_hash text NOT NULL,
 owner_id uuid NOT NULL REFERENCES responsavel(id),
 persona_id uuid NOT NULL,
 source_id uuid NOT NULL,
 token_id uuid,
 skill_id uuid,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','incorporated','rejected')),
 reviewer_id uuid REFERENCES responsavel(id), reviewed_at timestamptz, reason text,
 UNIQUE(catalog_id,id),
 CHECK(payload ?& ARRAY['id','catalogId','profileId','profilePublicationId','physicalSourceId','identityHash','basePublicationId','baseHash','profileHash','ownerId','personaId','sourceId','tokenId','grantId','skillId','hash','origin','sourceVersion','credentialVersion','summary','change','overrideCommon','createdAt']),
 FOREIGN KEY(catalog_id,profile_publication_id,profile_id,physical_source_id,identity_hash,base_publication_id,profile_hash)
 REFERENCES physical_profile_publication_v2(catalog_id,id,profile_id,physical_source_id,identity_hash,base_publication_id,hash),
 FOREIGN KEY(persona_id,owner_id) REFERENCES persona(id,responsavel_id),
 FOREIGN KEY(persona_id,source_id) REFERENCES fonte(persona_id,id),
 FOREIGN KEY(persona_id,token_id) REFERENCES persona_token(persona_id,id),
 FOREIGN KEY(persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
 CHECK(payload->>'id'=id::text AND payload->>'catalogId'=catalog_id::text
   AND payload->>'profileId'=profile_id::text AND payload->>'profilePublicationId'=profile_publication_id::text
   AND payload->>'physicalSourceId'=physical_source_id::text AND payload->>'identityHash'=identity_hash
   AND payload->>'basePublicationId'=base_publication_id::text AND payload->>'profileHash'=profile_hash
   AND payload->>'ownerId'=owner_id::text AND payload->>'personaId'=persona_id::text
   AND payload->>'sourceId'=source_id::text AND payload->>'hash'=hash
   AND (payload->>'tokenId') IS NOT DISTINCT FROM token_id::text
   AND (payload->>'skillId') IS NOT DISTINCT FROM skill_id::text),
 CHECK((payload->>'origin'='console' AND token_id IS NULL AND skill_id IS NULL AND payload->>'grantId' IS NULL)
   OR (payload->>'origin'='mcp' AND token_id IS NOT NULL AND skill_id IS NOT NULL)),
 CHECK((state='pending' AND reviewer_id IS NULL AND reviewed_at IS NULL AND reason IS NULL)
   OR (state<>'pending' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(reason) BETWEEN 1 AND 2000))
);
CREATE INDEX physical_proposal_scope_idx ON physical_knowledge_proposal_v2(catalog_id,profile_publication_id,id DESC);
CREATE TRIGGER physical_proposal_immutable BEFORE UPDATE OR DELETE ON physical_knowledge_proposal_v2
 FOR EACH ROW EXECUTE FUNCTION preserve_knowledge_proposal_v2();
CREATE TABLE physical_curation_preview_v2 (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'), catalog_id uuid NOT NULL,
 proposal_id uuid NOT NULL, binding text NOT NULL CHECK(binding ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 FOREIGN KEY(catalog_id,proposal_id) REFERENCES physical_knowledge_proposal_v2(catalog_id,id)
);
