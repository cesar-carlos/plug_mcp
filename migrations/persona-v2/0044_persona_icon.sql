-- Presentation only. Changing this row does not change authorization_version.
CREATE TABLE persona_icone (
  persona_id uuid PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type = 'image/png'),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 131072),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
