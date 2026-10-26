-- Keep a tombstone so removing and recreating an icon never reuses a revision.
ALTER TABLE persona_icone DROP CONSTRAINT persona_icone_bytes_check;
ALTER TABLE persona_icone ADD CONSTRAINT persona_icone_bytes_check
  CHECK (octet_length(bytes) BETWEEN 0 AND 131072);
