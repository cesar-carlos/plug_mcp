-- Derived, rebuildable metadata only. Existing publication payloads/hashes stay unchanged.
ALTER TABLE publicacao ADD CONSTRAINT publication_knowledge_hash_pair UNIQUE(persona_id,id,pacote_hash);
CREATE TABLE publication_knowledge_index_v2 (
 persona_id uuid NOT NULL,
 publication_id uuid NOT NULL,
 package_hash text NOT NULL CHECK(package_hash ~ '^[a-f0-9]{64}$'),
 index_version integer NOT NULL CHECK(index_version>0),
 documents jsonb NOT NULL CHECK(jsonb_typeof(documents)='array'),
 document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),
 rebuilt_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(persona_id,publication_id,index_version),
 FOREIGN KEY(persona_id,publication_id,package_hash) REFERENCES publicacao(persona_id,id,pacote_hash)
);
