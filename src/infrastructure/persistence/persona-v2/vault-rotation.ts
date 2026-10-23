import pg from "pg";
import { randomUUID } from "node:crypto";
import {
  PERSONA_VAULT_TARGETS,
  type VaultRotationJob,
  type VaultTarget,
} from "../../../domain/persona-v2/vault-rotation.js";
import type {
  PersonaVaultRotationStore,
  VaultCipherRow,
  VaultRotationSession,
  VaultRotationUnit,
} from "../../../domain/ports/persona-vault-rotation.port.js";
import { verifyPersonaMigrations } from "./migrate.js";

const keyExpression = (target: VaultTarget) =>
  `jsonb_build_object(${target.keys.map((key) => `'${key}',t.${key}`).join(",")})`;
interface JobRow {
  id: string;
  key_id: string;
  fingerprint: string;
  status: VaultRotationJob["status"];
  table_index: number;
  cursor: Record<string, unknown> | null;
  checked: string;
  changed: string;
}
const jobFrom = (r: JobRow): VaultRotationJob => ({
  id: r.id,
  keyId: r.key_id,
  fingerprint: r.fingerprint,
  status: r.status,
  tableIndex: r.table_index,
  cursor: r.cursor,
  checked: Number(r.checked),
  changed: Number(r.changed),
});

class Session implements VaultRotationSession {
  constructor(
    private readonly db: pg.Client,
    readonly databaseName: string,
  ) {}
  async validateBindings(keyId: string, bindings: Readonly<Record<string, string>>): Promise<void> {
    const stored = await this.db.query<{ key_id: string; fingerprint: string }>(
      "SELECT key_id,fingerprint FROM persona_vault_key_binding_v2 WHERE key_id=ANY($1)",
      [Object.keys(bindings)],
    );
    if (stored.rows.some((r) => bindings[r.key_id] !== r.fingerprint))
      throw new Error("Vault key ID reused with different material");
    const active = (
      await this.db.query<{ key_id: string; fingerprint: string }>(
        "SELECT a.key_id,b.fingerprint FROM persona_vault_active_key_v2 a JOIN persona_vault_key_binding_v2 b ON b.key_id=a.key_id WHERE a.singleton",
      )
    ).rows[0];
    if (active && active.key_id !== keyId && active.fingerprint === bindings[keyId])
      throw new Error("A new key ID requires new key material");
  }
  async transaction<T>(
    readOnly: boolean,
    work: (unit: VaultRotationUnit) => Promise<T>,
  ): Promise<T> {
    await this.db.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    try {
      await this.db.query("SET LOCAL lock_timeout='5s'");
      const result = await work(this);
      await this.db.query("COMMIT");
      return result;
    } catch (e) {
      await this.db.query("ROLLBACK");
      throw e;
    }
  }
  async scan(
    target: VaultTarget,
    cursor: Record<string, unknown> | null,
    limit: number,
    lock: boolean,
  ): Promise<readonly VaultCipherRow[]> {
    if (!PERSONA_VAULT_TARGETS.includes(target)) throw new Error("Unknown vault target");
    const expr = keyExpression(target);
    const r = await this.db.query<VaultCipherRow>(
      `SELECT ${expr} AS key,to_jsonb(t) AS content FROM public.${target.table} t WHERE ($1::jsonb IS NULL OR ${expr}>$1::jsonb) ORDER BY ${expr} LIMIT $2${lock ? " FOR UPDATE" : ""}`,
      [cursor === null ? null : JSON.stringify(cursor), limit],
    );
    return r.rows;
  }
  async start(
    keyId: string,
    bindings: Readonly<Record<string, string>>,
    resumeId?: string,
  ): Promise<VaultRotationJob> {
    const current = await this.db.query<JobRow>(
      "SELECT * FROM persona_vault_rotation_v2 WHERE status='running' FOR UPDATE",
    );
    const runningId = current.rows[0]?.id;
    if (runningId !== undefined && runningId !== resumeId)
      throw new Error("Explicit vault resume required");
    if (resumeId) {
      if (
        !(
          await this.db.query<{ matches: boolean }>(
            "SELECT persona_vault_keyring_matches_v2($1,$2) AS matches",
            [keyId, JSON.stringify(bindings)],
          )
        ).rows[0]?.matches
      )
        throw new Error("Vault resume keyring differs");
      const found = (
        await this.db.query<JobRow>(
          "SELECT * FROM persona_vault_rotation_v2 WHERE id=$1 FOR UPDATE",
          [resumeId],
        )
      ).rows[0];
      const active = (
        await this.db.query<{ key_id: string }>(
          "SELECT key_id FROM persona_vault_active_key_v2 WHERE singleton FOR UPDATE",
        )
      ).rows[0];
      if (
        found?.key_id !== keyId ||
        found?.fingerprint !== bindings[keyId] ||
        active?.key_id !== keyId
      )
        throw new Error("Vault resume binding differs");
      return jobFrom(found);
    }
    const activeBinding = (
      await this.db.query<{ key_id: string; fingerprint: string }>(
        "SELECT a.key_id,b.fingerprint FROM persona_vault_active_key_v2 a JOIN persona_vault_key_binding_v2 b ON b.key_id=a.key_id WHERE a.singleton",
      )
    ).rows[0];
    if (
      activeBinding &&
      activeBinding.key_id !== keyId &&
      activeBinding.fingerprint === bindings[keyId]
    )
      throw new Error("A new key ID requires new key material");
    for (const [id, fingerprint] of Object.entries(bindings)) {
      const stored = await this.db.query<{ fingerprint: string }>(
        "SELECT fingerprint FROM persona_vault_key_binding_v2 WHERE key_id=$1",
        [id],
      );
      const savedFingerprint = stored.rows[0]?.fingerprint;
      if (savedFingerprint !== undefined && savedFingerprint !== fingerprint)
        throw new Error("Vault key ID reused with different material");
      await this.db.query(
        "INSERT INTO persona_vault_key_binding_v2(key_id,fingerprint) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, fingerprint],
      );
      if (
        (
          await this.db.query<{ fingerprint: string }>(
            "SELECT fingerprint FROM persona_vault_key_binding_v2 WHERE key_id=$1",
            [id],
          )
        ).rows[0]?.fingerprint !== fingerprint
      )
        throw new Error("Vault key binding changed concurrently");
    }
    await this.db.query(
      "INSERT INTO persona_vault_active_key_v2(singleton,key_id) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET key_id=excluded.key_id",
      [keyId],
    );
    return jobFrom(
      (
        await this.db.query<JobRow>(
          "INSERT INTO persona_vault_rotation_v2(id,key_id,fingerprint,required_keys,status) VALUES($1,$2,$3,$4,'running') RETURNING *",
          [randomUUID(), keyId, bindings[keyId], Object.keys(bindings)],
        )
      ).rows[0]!,
    );
  }
  async rewrap(
    job: VaultRotationJob,
    target: VaultTarget,
    row: VaultCipherRow,
    replacements: Readonly<Record<string, string>>,
  ): Promise<void> {
    const r = await this.db.query<{ changed: boolean }>(
      "SELECT persona_vault_rewrap_v2($1,$2,$3,$4,$5) AS changed",
      [
        job.id,
        target.table,
        JSON.stringify(row.key),
        JSON.stringify(row.content),
        JSON.stringify(replacements),
      ],
    );
    if (!r.rows[0]?.changed) throw new Error("Vault row changed concurrently");
  }
  async progress(job: VaultRotationJob): Promise<void> {
    const r = await this.db.query(
      "UPDATE persona_vault_rotation_v2 SET table_index=$2,cursor=$3,checked=$4,changed=$5,status=$6,updated_at=now() WHERE id=$1 AND key_id=$7 AND fingerprint=$8 AND status='running'",
      [
        job.id,
        job.tableIndex,
        job.cursor === null ? null : JSON.stringify(job.cursor),
        job.checked,
        job.changed,
        job.status,
        job.keyId,
        job.fingerprint,
      ],
    );
    if (r.rowCount !== 1) throw new Error("Vault rotation changed");
  }
}

export class PostgresPersonaVaultRotationStore implements PersonaVaultRotationStore {
  constructor(private readonly databaseUrl: string) {}
  async exclusive<T>(work: (session: VaultRotationSession) => Promise<T>): Promise<T> {
    const db = new pg.Client({ connectionString: this.databaseUrl });
    await db.connect();
    let locked = false;
    let connected = true;
    db.on("error", () => {
      connected = false;
    });
    try {
      await verifyPersonaMigrations(db);
      const info = (
        await db.query<{ name: string; operator: boolean }>(
          "SELECT current_database() AS name,persona_vault_operator_v2() AS operator",
        )
      ).rows[0]!;
      if (!info.operator || ["postgres", "template0", "template1"].includes(info.name))
        throw new Error("Dedicated persona vault operator required");
      locked = (
        await db.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(19370003) AS locked")
      ).rows[0]!.locked;
      if (!locked) throw new Error("Vault rotation already locked");
      const expected = PERSONA_VAULT_TARGETS.flatMap((t) =>
        t.fields.map((field) => `${t.table}.${field}`),
      ).sort();
      const actual = (
        await db.query<{ field: string }>(
          "SELECT c.relname||'.'||a.attname AS field FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped AND a.attname LIKE '%\\_enc' ESCAPE '\\' ORDER BY field",
        )
      ).rows.map((r) => r.field);
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error("Vault encrypted field inventory differs");
      return await work(new Session(db, info.name));
    } finally {
      try {
        if (locked && connected) await db.query("SELECT pg_advisory_unlock(19370003)");
      } finally {
        await db.end();
      }
    }
  }
}
