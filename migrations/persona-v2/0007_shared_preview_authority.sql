-- Pin the active predecessor as well as the draft and membership revision.
ALTER TABLE structure_preview_v2 ADD COLUMN publicacao_anterior_id uuid;
ALTER TABLE structure_preview_v2 ADD CONSTRAINT structure_preview_previous_fk
  FOREIGN KEY (catalogo_id,padrao_id,publicacao_anterior_id)
  REFERENCES structure_publication_v2(catalogo_id,padrao_id,id);
-- Previews produced without this fence must be reviewed again, never guessed.
UPDATE structure_preview_v2 SET expires_at=LEAST(expires_at,now()) WHERE consumed_at IS NULL;
