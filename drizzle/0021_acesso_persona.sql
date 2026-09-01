ALTER TABLE acesso ADD COLUMN IF NOT EXISTS nome_persona text;
ALTER TABLE acesso ADD COLUMN IF NOT EXISTS instrucoes_persona text;

ALTER TABLE acesso DROP CONSTRAINT IF EXISTS acesso_nome_persona_len;
ALTER TABLE acesso ADD CONSTRAINT acesso_nome_persona_len
  CHECK (nome_persona IS NULL OR char_length(nome_persona) <= 80);

ALTER TABLE acesso DROP CONSTRAINT IF EXISTS acesso_instrucoes_persona_len;
ALTER TABLE acesso ADD CONSTRAINT acesso_instrucoes_persona_len
  CHECK (instrucoes_persona IS NULL OR char_length(instrucoes_persona) <= 4000);
