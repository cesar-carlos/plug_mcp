-- Explicit catalog-scoped physical knowledge. No promotion of private training.
ALTER TABLE fonte_fisica ADD CONSTRAINT physical_identity_pair UNIQUE(id,identity_hash);
CREATE TABLE physical_profile_v2 (
 id uuid PRIMARY KEY,
 catalog_id uuid NOT NULL REFERENCES knowledge_catalog_v2(id),
 physical_source_id uuid NOT NULL,
 identity_hash text NOT NULL,
 base_publication_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 draft jsonb NOT NULL,
 UNIQUE(catalog_id,id),
 UNIQUE(catalog_id,id,physical_source_id,identity_hash,base_publication_id),
 FOREIGN KEY(physical_source_id,identity_hash) REFERENCES fonte_fisica(id,identity_hash),
 FOREIGN KEY(catalog_id,base_publication_id) REFERENCES structure_publication_v2(catalogo_id,id)
);
CREATE TABLE physical_profile_publication_v2 (
 id uuid PRIMARY KEY,
 catalog_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 physical_source_id uuid NOT NULL,
 identity_hash text NOT NULL,
 base_publication_id uuid NOT NULL,
 snapshot jsonb NOT NULL,
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(catalog_id,id),
 FOREIGN KEY(catalog_id,profile_id,physical_source_id,identity_hash,base_publication_id)
 REFERENCES physical_profile_v2(catalog_id,id,physical_source_id,identity_hash,base_publication_id)
);
CREATE TRIGGER physical_profile_publication_immutable BEFORE UPDATE OR DELETE ON physical_profile_publication_v2
 FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
CREATE TABLE physical_profile_preview_v2 (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 catalog_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 revision integer NOT NULL,
 owner_id uuid NOT NULL REFERENCES responsavel(id),
 catalog_version integer NOT NULL,
 evidence_id uuid NOT NULL REFERENCES source_structure_evidence_v2(id),
 evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 FOREIGN KEY(catalog_id,profile_id) REFERENCES physical_profile_v2(catalog_id,id)
);
CREATE TABLE physical_profile_suspension_v2 (
 publication_id uuid PRIMARY KEY,
 catalog_id uuid NOT NULL,
 owner_id uuid NOT NULL REFERENCES responsavel(id),
 suspended_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(catalog_id,publication_id) REFERENCES physical_profile_publication_v2(catalog_id,id)
);
