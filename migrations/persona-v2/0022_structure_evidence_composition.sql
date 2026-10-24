-- Lineage binds immutable pages to the same persona/source/credential/identity and hashes.
ALTER TABLE source_structure_evidence_v2 ADD CONSTRAINT structure_evidence_lineage_key
  UNIQUE(persona_id,id,fonte_id,source_version,credential_version,identity_hash,evidence_hash);
CREATE TABLE source_structure_evidence_part_v2 (
  persona_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  page_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>=0 AND ordinal<16),
  fonte_id uuid NOT NULL,
  source_version integer NOT NULL,
  credential_version integer NOT NULL,
  identity_hash text NOT NULL,
  parent_hash text NOT NULL,
  page_hash text NOT NULL,
  PRIMARY KEY(persona_id,evidence_id,ordinal),
  UNIQUE(persona_id,evidence_id,page_id),
  CHECK(evidence_id<>page_id),
  FOREIGN KEY(persona_id,evidence_id,fonte_id,source_version,credential_version,identity_hash,parent_hash)
    REFERENCES source_structure_evidence_v2(persona_id,id,fonte_id,source_version,credential_version,identity_hash,evidence_hash),
  FOREIGN KEY(persona_id,page_id,fonte_id,source_version,credential_version,identity_hash,page_hash)
    REFERENCES source_structure_evidence_v2(persona_id,id,fonte_id,source_version,credential_version,identity_hash,evidence_hash)
);
CREATE TRIGGER structure_evidence_part_immutable BEFORE UPDATE OR DELETE ON source_structure_evidence_part_v2
  FOR EACH ROW EXECUTE FUNCTION refuse_publication_mutation();
