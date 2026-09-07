-- MCP Bearer authenticates exactly one acesso (persona), not the usuario_mcp row.
-- Setup codes for extra personas (N>1) live in mcp_setup with a 7-day TTL.
-- Ops: SELECT code, acesso_id, expires_at FROM mcp_setup WHERE expires_at > now();
-- then GET /setup/{code} (one-shot). After TTL, rotate on that persona or re-issue setup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE acesso ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE acesso ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS mcp_setup (
  code text PRIMARY KEY,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  acesso_id uuid REFERENCES acesso (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mcp_setup_expires_idx ON mcp_setup (expires_at);

DO $$
DECLARE
  rec record;
  extra record;
  rn int;
  tok text;
  th text;
  setup_code text;
  n_extra int := 0;
  n_leftover int := 0;
BEGIN
  FOR rec IN
    SELECT u.id AS usuario_id, u.token_hash, u.token_expires_at
    FROM usuario_mcp u
  LOOP
    rn := 0;
    FOR extra IN
      SELECT a.id
      FROM acesso a
      WHERE a.usuario_id = rec.usuario_id
      ORDER BY a.created_at ASC, a.id ASC
    LOOP
      rn := rn + 1;
      IF rn = 1 THEN
        UPDATE acesso
        SET
          token_hash = rec.token_hash,
          token_expires_at = rec.token_expires_at,
          updated_at = now()
        WHERE id = extra.id AND token_hash IS NULL;
      ELSE
        tok := encode(gen_random_bytes(32), 'hex');
        th := encode(digest(tok, 'sha256'), 'hex');
        setup_code := encode(gen_random_bytes(16), 'hex');
        UPDATE acesso
        SET
          token_hash = th,
          token_expires_at = rec.token_expires_at,
          updated_at = now()
        WHERE id = extra.id AND token_hash IS NULL;
        INSERT INTO mcp_setup (code, token, expires_at, acesso_id)
        VALUES (setup_code, tok, now() + interval '7 days', extra.id);
        n_extra := n_extra + 1;
      END IF;
    END LOOP;
  END LOOP;

  FOR extra IN
    SELECT a.id
    FROM acesso a
    WHERE a.token_hash IS NULL
  LOOP
    tok := encode(gen_random_bytes(32), 'hex');
    th := encode(digest(tok, 'sha256'), 'hex');
    setup_code := encode(gen_random_bytes(16), 'hex');
    UPDATE acesso
    SET
      token_hash = th,
      updated_at = now()
    WHERE id = extra.id;
    INSERT INTO mcp_setup (code, token, expires_at, acesso_id)
    VALUES (setup_code, tok, now() + interval '7 days', extra.id);
    n_leftover := n_leftover + 1;
  END LOOP;

  RAISE NOTICE
    '0023 token por acesso: % personas extras + % leftovers com setup em mcp_setup (TTL 7 dias). Consuma GET /setup/{code}.',
    n_extra,
    n_leftover;
END $$;

ALTER TABLE acesso ALTER COLUMN token_hash SET NOT NULL;

DROP INDEX IF EXISTS usuario_mcp_token_hash_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS acesso_token_hash_uidx ON acesso (token_hash);

ALTER TABLE usuario_mcp DROP COLUMN IF EXISTS token_hash;
ALTER TABLE usuario_mcp DROP COLUMN IF EXISTS token_expires_at;
