-- Editorial libraries are independent of executable publication snapshots.
CREATE TABLE knowledge_library_v2 (
 id uuid PRIMARY KEY, catalog_id uuid NOT NULL REFERENCES knowledge_catalog_v2(id),
 slug text NOT NULL, kind text NOT NULL CHECK(kind IN ('template','dataset')),
 version integer NOT NULL CHECK(version>0),
 UNIQUE(catalog_id,id), UNIQUE(catalog_id,id,kind), UNIQUE(catalog_id,slug)
);
CREATE TABLE knowledge_library_version_v2 (
 catalog_id uuid NOT NULL, library_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 name text NOT NULL, hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid NOT NULL REFERENCES responsavel(id), created_at timestamptz NOT NULL,
 payload_enc text NOT NULL, template_id uuid, template_version integer,
 template_kind text NOT NULL DEFAULT 'template' CHECK(template_kind='template'),
 PRIMARY KEY(catalog_id,library_id,version),
 FOREIGN KEY(catalog_id,library_id) REFERENCES knowledge_library_v2(catalog_id,id),
 FOREIGN KEY(catalog_id,template_id,template_kind) REFERENCES knowledge_library_v2(catalog_id,id,kind),
 FOREIGN KEY(catalog_id,template_id,template_version) REFERENCES knowledge_library_version_v2(catalog_id,library_id,version),
 CHECK((template_id IS NULL AND template_version IS NULL) OR (template_id IS NOT NULL AND template_version>0))
);
CREATE FUNCTION knowledge_library_immutable_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'knowledge library versions are immutable'; END $$;
CREATE TRIGGER knowledge_library_version_immutable_v2 BEFORE UPDATE OR DELETE ON knowledge_library_version_v2
 FOR EACH ROW EXECUTE FUNCTION knowledge_library_immutable_v2();
CREATE TABLE knowledge_library_draft_origin_v2 (
 persona_id uuid NOT NULL, skill_id uuid NOT NULL, catalog_id uuid NOT NULL,
 template_id uuid NOT NULL, template_version integer NOT NULL,
 source_id uuid NOT NULL, source_version integer NOT NULL,
 dialect text NOT NULL CHECK(dialect IN ('postgres','mssql','sybase','firebird')),
 dataset_id uuid, dataset_version integer,
 PRIMARY KEY(persona_id,skill_id),
 FOREIGN KEY(persona_id,skill_id) REFERENCES skill_v2(persona_id,id),
 FOREIGN KEY(persona_id,source_id) REFERENCES fonte(persona_id,id),
 FOREIGN KEY(catalog_id,template_id,template_version) REFERENCES knowledge_library_version_v2(catalog_id,library_id,version),
 FOREIGN KEY(catalog_id,dataset_id,dataset_version) REFERENCES knowledge_library_version_v2(catalog_id,library_id,version),
 CHECK((dataset_id IS NULL AND dataset_version IS NULL) OR (dataset_id IS NOT NULL AND dataset_version>0))
);
