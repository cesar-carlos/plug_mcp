-- Catalog, graph and learning partitioned by acesso_id (persona), not agent_id.
-- Cutover: attach rows when the agent has one acesso; duplicate independent copies
-- when several acessos share the same agent_id; leave orphan rows (zero acessos)
-- with NULL acesso_id (no NOT NULL violation). grafo_dialeto / grafo_lock drop orphans
-- because they need a non-null primary key.

ALTER TABLE grafo_dialeto ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE grafo_lock ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE tabela_grafo ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE relacionamento_grafo ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE schema_snapshot ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE skill ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE anotacao_grafo ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE consulta_aprendida ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE sinonimo ADD COLUMN IF NOT EXISTS acesso_id uuid;
ALTER TABLE lacuna_consulta ADD COLUMN IF NOT EXISTS acesso_id uuid;

-- Drop uniques/PKs keyed by agent_id before duplicating catalogs (same slug/nome per extra acesso).
ALTER TABLE grafo_dialeto DROP CONSTRAINT IF EXISTS grafo_dialeto_pkey;
ALTER TABLE grafo_lock DROP CONSTRAINT IF EXISTS grafo_lock_pkey;
DROP INDEX IF EXISTS tabela_grafo_agent_nome_uidx;
DROP INDEX IF EXISTS rel_grafo_pares_uidx;
DROP INDEX IF EXISTS schema_snapshot_agent_tabela_uidx;
DROP INDEX IF EXISTS skill_agent_slug_uidx;
DROP INDEX IF EXISTS lacuna_consulta_agent_tipo_chave_uidx;

DO $$
DECLARE
  extra record;
  canonical uuid;
  n_orfao bigint;
BEGIN
  CREATE TEMP TABLE tmp_agent_acesso (
    agent_id uuid NOT NULL,
    acesso_id uuid NOT NULL,
    rn int NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_agent_acesso (agent_id, acesso_id, rn)
  SELECT
    a.agent_id,
    a.id,
    row_number() OVER (PARTITION BY a.agent_id ORDER BY a.created_at ASC, a.id ASC)::int
  FROM acesso a;

  -- Attach canonical (rn = 1) to existing rows.
  UPDATE grafo_dialeto d
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = d.agent_id AND t.rn = 1 AND d.acesso_id IS NULL;

  UPDATE grafo_lock l
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = l.agent_id AND t.rn = 1 AND l.acesso_id IS NULL;

  UPDATE tabela_grafo g
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = g.agent_id AND t.rn = 1 AND g.acesso_id IS NULL;

  UPDATE relacionamento_grafo r
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = r.agent_id AND t.rn = 1 AND r.acesso_id IS NULL;

  UPDATE schema_snapshot s
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = s.agent_id AND t.rn = 1 AND s.acesso_id IS NULL;

  UPDATE skill s
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = s.agent_id AND t.rn = 1 AND s.acesso_id IS NULL;

  UPDATE anotacao_grafo n
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = n.agent_id AND t.rn = 1 AND n.acesso_id IS NULL;

  UPDATE consulta_aprendida c
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = c.agent_id AND t.rn = 1 AND c.acesso_id IS NULL;

  UPDATE sinonimo s
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = s.agent_id AND t.rn = 1 AND s.acesso_id IS NULL;

  UPDATE lacuna_consulta l
  SET acesso_id = t.acesso_id
  FROM tmp_agent_acesso t
  WHERE t.agent_id = l.agent_id AND t.rn = 1 AND l.acesso_id IS NULL;

  SELECT count(*) INTO n_orfao FROM skill WHERE acesso_id IS NULL;
  RAISE NOTICE '0022 orphan skill rows (agent_id with zero acessos): %', n_orfao;
  SELECT count(*) INTO n_orfao FROM tabela_grafo WHERE acesso_id IS NULL;
  RAISE NOTICE '0022 orphan tabela_grafo rows: %', n_orfao;

  -- Independent copies for extra acessos (rn > 1). Never share mutable graph rows.
  FOR extra IN
    SELECT agent_id, acesso_id FROM tmp_agent_acesso WHERE rn > 1
  LOOP
    SELECT acesso_id INTO canonical
    FROM tmp_agent_acesso
    WHERE agent_id = extra.agent_id AND rn = 1;

    CREATE TEMP TABLE map_tabela (
      old_id uuid PRIMARY KEY,
      new_id uuid NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE map_skill (
      old_id uuid PRIMARY KEY,
      new_id uuid NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE map_rel (
      old_id uuid PRIMARY KEY,
      new_id uuid NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE map_consulta (
      old_id uuid PRIMARY KEY,
      new_id uuid NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO map_tabela (old_id, new_id)
    SELECT id, gen_random_uuid()
    FROM tabela_grafo
    WHERE acesso_id = canonical;

    INSERT INTO tabela_grafo (
      id, acesso_id, nome, descricao, origem, status, autor_usuario_id, created_at, updated_at
    )
    SELECT
      m.new_id,
      extra.acesso_id,
      t.nome,
      t.descricao,
      t.origem,
      t.status,
      t.autor_usuario_id,
      t.created_at,
      t.updated_at
    FROM tabela_grafo t
    JOIN map_tabela m ON m.old_id = t.id;

    INSERT INTO coluna_grafo (
      id, tabela_id, nome, tipo, nullable, descricao, dicionario, papel, formato, perfil,
      sensibilidade, origem, status, autor_usuario_id, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      m.new_id,
      c.nome,
      c.tipo,
      c.nullable,
      c.descricao,
      c.dicionario,
      c.papel,
      c.formato,
      c.perfil,
      c.sensibilidade,
      c.origem,
      c.status,
      c.autor_usuario_id,
      c.created_at,
      c.updated_at
    FROM coluna_grafo c
    JOIN map_tabela m ON m.old_id = c.tabela_id;

    INSERT INTO map_rel (old_id, new_id)
    SELECT id, gen_random_uuid()
    FROM relacionamento_grafo
    WHERE acesso_id = canonical;

    INSERT INTO relacionamento_grafo (
      id, acesso_id, tabela_origem_id, coluna_origem, tabela_destino_id, coluna_destino,
      pares_fingerprint, tipo_join, cardinalidade, descricao, escopo_validacao, origem, status,
      autor_usuario_id, created_at, updated_at
    )
    SELECT
      mr.new_id,
      extra.acesso_id,
      mo.new_id,
      r.coluna_origem,
      md.new_id,
      r.coluna_destino,
      r.pares_fingerprint,
      r.tipo_join,
      r.cardinalidade,
      r.descricao,
      r.escopo_validacao,
      r.origem,
      r.status,
      r.autor_usuario_id,
      r.created_at,
      r.updated_at
    FROM relacionamento_grafo r
    JOIN map_rel mr ON mr.old_id = r.id
    JOIN map_tabela mo ON mo.old_id = r.tabela_origem_id
    JOIN map_tabela md ON md.old_id = r.tabela_destino_id;

    INSERT INTO relacionamento_grafo_par (relacionamento_id, ordem, coluna_origem, coluna_destino)
    SELECT mr.new_id, p.ordem, p.coluna_origem, p.coluna_destino
    FROM relacionamento_grafo_par p
    JOIN map_rel mr ON mr.old_id = p.relacionamento_id;

    INSERT INTO schema_snapshot (id, acesso_id, tabela_nome, assinatura, created_at, updated_at)
    SELECT gen_random_uuid(), extra.acesso_id, s.tabela_nome, s.assinatura, s.created_at, s.updated_at
    FROM schema_snapshot s
    WHERE s.acesso_id = canonical;

    INSERT INTO grafo_dialeto (agent_id, acesso_id, dialeto, created_at)
    SELECT extra.agent_id, extra.acesso_id, d.dialeto, d.created_at
    FROM grafo_dialeto d
    WHERE d.acesso_id = canonical
      AND NOT EXISTS (SELECT 1 FROM grafo_dialeto x WHERE x.acesso_id = extra.acesso_id);

    INSERT INTO grafo_lock (agent_id, acesso_id)
    SELECT extra.agent_id, extra.acesso_id
    WHERE NOT EXISTS (SELECT 1 FROM grafo_lock WHERE acesso_id = extra.acesso_id);

    INSERT INTO map_skill (old_id, new_id)
    SELECT id, gen_random_uuid()
    FROM skill
    WHERE acesso_id = canonical;

    INSERT INTO skill (
      id, acesso_id, slug, nome, descricao, sql_modelo, params, escopo, versao, pacote_versao,
      status, motivo_revalidacao, consulta_semantica, politica_consulta, autor_usuario_id,
      created_at, updated_at
    )
    SELECT
      ms.new_id,
      extra.acesso_id,
      s.slug,
      s.nome,
      s.descricao,
      s.sql_modelo,
      s.params,
      s.escopo,
      s.versao,
      s.pacote_versao,
      s.status,
      s.motivo_revalidacao,
      s.consulta_semantica,
      s.politica_consulta,
      s.autor_usuario_id,
      s.created_at,
      s.updated_at
    FROM skill s
    JOIN map_skill ms ON ms.old_id = s.id;

    INSERT INTO anotacao_grafo (
      id, acesso_id, tabela_id, skill_id, tipo, titulo, texto, autor_usuario_id, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      extra.acesso_id,
      CASE WHEN n.tabela_id IS NULL THEN NULL ELSE mt.new_id END,
      CASE WHEN n.skill_id IS NULL THEN NULL ELSE ms.new_id END,
      n.tipo,
      n.titulo,
      n.texto,
      n.autor_usuario_id,
      n.created_at,
      n.updated_at
    FROM anotacao_grafo n
    LEFT JOIN map_tabela mt ON mt.old_id = n.tabela_id
    LEFT JOIN map_skill ms ON ms.old_id = n.skill_id
    WHERE n.acesso_id = canonical;

    INSERT INTO map_consulta (old_id, new_id)
    SELECT id, gen_random_uuid()
    FROM consulta_aprendida
    WHERE acesso_id = canonical;

    INSERT INTO consulta_aprendida (
      id, acesso_id, pergunta, sql, params_contrato, execucoes, ultima_execucao, status,
      autor_usuario_id, created_at, updated_at
    )
    SELECT
      mc.new_id,
      extra.acesso_id,
      c.pergunta,
      c.sql,
      c.params_contrato,
      c.execucoes,
      c.ultima_execucao,
      c.status,
      c.autor_usuario_id,
      c.created_at,
      c.updated_at
    FROM consulta_aprendida c
    JOIN map_consulta mc ON mc.old_id = c.id;

    INSERT INTO consulta_aprendida_skill (consulta_id, skill_id)
    SELECT mc.new_id, ms.new_id
    FROM consulta_aprendida_skill cs
    JOIN map_consulta mc ON mc.old_id = cs.consulta_id
    JOIN map_skill ms ON ms.old_id = cs.skill_id;

    INSERT INTO sinonimo (id, acesso_id, termo, alvo_tipo, alvo_id, created_at)
    SELECT
      gen_random_uuid(),
      extra.acesso_id,
      s.termo,
      s.alvo_tipo,
      CASE
        WHEN s.alvo_tipo = 'skill' AND ms.new_id IS NOT NULL THEN ms.new_id::text
        ELSE s.alvo_id
      END,
      s.created_at
    FROM sinonimo s
    LEFT JOIN map_skill ms ON ms.old_id::text = s.alvo_id
    WHERE s.acesso_id = canonical;

    INSERT INTO lacuna_consulta (
      id, acesso_id, pergunta, pergunta_chave, tipo, status, contrato, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      extra.acesso_id,
      l.pergunta,
      l.pergunta_chave,
      l.tipo,
      l.status,
      l.contrato,
      l.created_at,
      l.updated_at
    FROM lacuna_consulta l
    WHERE l.acesso_id = canonical;

    DROP TABLE map_tabela;
    DROP TABLE map_skill;
    DROP TABLE map_rel;
    DROP TABLE map_consulta;
  END LOOP;
END
$$;

-- grafo_dialeto / grafo_lock: PK must be NOT NULL. Drop orphans (zero acessos).
DELETE FROM grafo_dialeto WHERE acesso_id IS NULL;
DELETE FROM grafo_lock WHERE acesso_id IS NULL;

ALTER TABLE grafo_dialeto ALTER COLUMN acesso_id SET NOT NULL;
ALTER TABLE grafo_dialeto ADD PRIMARY KEY (acesso_id);
ALTER TABLE grafo_dialeto DROP COLUMN IF EXISTS agent_id;
ALTER TABLE grafo_dialeto
  ADD CONSTRAINT grafo_dialeto_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

ALTER TABLE grafo_lock ALTER COLUMN acesso_id SET NOT NULL;
ALTER TABLE grafo_lock ADD PRIMARY KEY (acesso_id);
ALTER TABLE grafo_lock DROP COLUMN IF EXISTS agent_id;
ALTER TABLE grafo_lock
  ADD CONSTRAINT grafo_lock_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

ALTER TABLE tabela_grafo DROP CONSTRAINT IF EXISTS tabela_grafo_agent_nome_uidx;
DROP INDEX IF EXISTS tabela_grafo_agent_idx;
DROP INDEX IF EXISTS tabela_grafo_agent_search_tsv_gin;
CREATE UNIQUE INDEX IF NOT EXISTS tabela_grafo_acesso_nome_uidx ON tabela_grafo (acesso_id, nome);
CREATE INDEX IF NOT EXISTS tabela_grafo_acesso_idx ON tabela_grafo (acesso_id);
CREATE INDEX IF NOT EXISTS tabela_grafo_acesso_search_tsv_gin ON tabela_grafo USING GIN (acesso_id, search_tsv);
ALTER TABLE tabela_grafo DROP COLUMN IF EXISTS agent_id;
ALTER TABLE tabela_grafo
  ADD CONSTRAINT tabela_grafo_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS rel_grafo_agent_idx;
CREATE UNIQUE INDEX IF NOT EXISTS rel_grafo_pares_uidx
  ON relacionamento_grafo (acesso_id, tabela_origem_id, tabela_destino_id, pares_fingerprint);
CREATE INDEX IF NOT EXISTS rel_grafo_acesso_idx ON relacionamento_grafo (acesso_id);
ALTER TABLE relacionamento_grafo DROP COLUMN IF EXISTS agent_id;
ALTER TABLE relacionamento_grafo
  ADD CONSTRAINT relacionamento_grafo_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS schema_snapshot_acesso_tabela_uidx
  ON schema_snapshot (acesso_id, tabela_nome);
ALTER TABLE schema_snapshot DROP COLUMN IF EXISTS agent_id;
ALTER TABLE schema_snapshot
  ADD CONSTRAINT schema_snapshot_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS skill_agent_idx;
DROP INDEX IF EXISTS skill_agent_search_tsv_gin;
CREATE UNIQUE INDEX IF NOT EXISTS skill_acesso_slug_uidx ON skill (acesso_id, slug);
CREATE INDEX IF NOT EXISTS skill_acesso_idx ON skill (acesso_id);
CREATE INDEX IF NOT EXISTS skill_acesso_search_tsv_gin ON skill USING GIN (acesso_id, search_tsv);
ALTER TABLE skill DROP COLUMN IF EXISTS agent_id;
ALTER TABLE skill
  ADD CONSTRAINT skill_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS anotacao_grafo_agent_idx;
DROP INDEX IF EXISTS anotacao_grafo_agent_search_tsv_gin;
CREATE INDEX IF NOT EXISTS anotacao_grafo_acesso_idx ON anotacao_grafo (acesso_id);
CREATE INDEX IF NOT EXISTS anotacao_grafo_acesso_search_tsv_gin
  ON anotacao_grafo USING GIN (acesso_id, search_tsv);
ALTER TABLE anotacao_grafo DROP COLUMN IF EXISTS agent_id;
ALTER TABLE anotacao_grafo
  ADD CONSTRAINT anotacao_grafo_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS consulta_aprendida_agent_idx;
DROP INDEX IF EXISTS consulta_aprendida_agent_search_tsv_gin;
CREATE INDEX IF NOT EXISTS consulta_aprendida_acesso_idx ON consulta_aprendida (acesso_id);
CREATE INDEX IF NOT EXISTS consulta_aprendida_acesso_search_tsv_gin
  ON consulta_aprendida USING GIN (acesso_id, search_tsv);
ALTER TABLE consulta_aprendida DROP COLUMN IF EXISTS agent_id;
ALTER TABLE consulta_aprendida
  ADD CONSTRAINT consulta_aprendida_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS sinonimo_agent_idx;
CREATE INDEX IF NOT EXISTS sinonimo_acesso_idx ON sinonimo (acesso_id);
ALTER TABLE sinonimo DROP COLUMN IF EXISTS agent_id;
ALTER TABLE sinonimo
  ADD CONSTRAINT sinonimo_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS lacuna_consulta_agent_idx;
CREATE INDEX IF NOT EXISTS lacuna_consulta_acesso_idx ON lacuna_consulta (acesso_id);
CREATE UNIQUE INDEX IF NOT EXISTS lacuna_consulta_acesso_tipo_chave_uidx
  ON lacuna_consulta (acesso_id, tipo, pergunta_chave);
ALTER TABLE lacuna_consulta DROP COLUMN IF EXISTS agent_id;
ALTER TABLE lacuna_consulta
  ADD CONSTRAINT lacuna_consulta_acesso_fk
  FOREIGN KEY (acesso_id) REFERENCES acesso (id) ON DELETE CASCADE;
