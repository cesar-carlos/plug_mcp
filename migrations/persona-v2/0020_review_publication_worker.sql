-- New requirements leave old publication snapshots/calendars untouched.
CREATE TABLE knowledge_review_plan_v2 (
 kind text NOT NULL CHECK(kind IN ('privado','padrao','perfil')), draft_id uuid NOT NULL,
 persona_id uuid, catalog_id uuid, revision integer NOT NULL CHECK(revision>0),
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'), version integer NOT NULL CHECK(version>0),
 due_at timestamptz NOT NULL, owner_id uuid NOT NULL REFERENCES responsavel(id),
 PRIMARY KEY(kind,draft_id),
 CHECK((kind='privado' AND persona_id IS NOT NULL AND catalog_id IS NULL)
 OR (kind IN ('padrao','perfil') AND catalog_id IS NOT NULL AND persona_id IS NULL))
);
CREATE TABLE knowledge_review_preview_v2 (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'), plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object')
);
CREATE TABLE knowledge_review_task_v2 (
 id uuid PRIMARY KEY, kind text NOT NULL, publication_id uuid NOT NULL, calendar_version integer NOT NULL,
 due_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 UNIQUE(kind,publication_id,calendar_version),
 FOREIGN KEY(kind,publication_id,calendar_version) REFERENCES knowledge_review_history_v2(kind,publication_id,version)
);
CREATE TABLE knowledge_review_notification_v2 (
 task_id uuid PRIMARY KEY REFERENCES knowledge_review_task_v2(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE knowledge_review_notification_read_v2 (
 task_id uuid NOT NULL REFERENCES knowledge_review_notification_v2(task_id),
 owner_id uuid NOT NULL REFERENCES responsavel(id), read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,owner_id)
);
CREATE TABLE persona_review_worker_lease_v2 (
 name text PRIMARY KEY CHECK(name='knowledge-review'), owner uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX knowledge_review_task_open_idx ON knowledge_review_task_v2(kind,publication_id) WHERE closed_at IS NULL;
