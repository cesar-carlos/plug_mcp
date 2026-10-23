import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import pg from "pg";
import request from "supertest";
import { afterAll, expect, it } from "vitest";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { composePersonaV2 } from "../../src/composition/compose-persona-v2.js";
import { testConfig } from "../../src/config/env.js";
import { PostgresPersonaOutbox } from "../../src/infrastructure/persistence/persona-v2/outbox-worker.js";
import { PersonaOutboxWorker } from "../../src/application/persona-v2/outbox-worker.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaReviewWorker } from "../../src/application/persona-v2/review-worker.js";
import { PostgresReviewWorker } from "../../src/infrastructure/persistence/persona-v2/review-worker.js";
import {
  notificationProviderFixture,
  fixtureNotificationSecret,
} from "../helpers/persona-notification-provider.js";
import { notificationUrl } from "../../src/infrastructure/persona-v2/notification-transport.js";
import { PersonaVaultRotation } from "../../src/application/persona-v2/vault-rotation.js";
import { PostgresPersonaVaultRotationStore } from "../../src/infrastructure/persistence/persona-v2/vault-rotation.js";
import { PostgresPersonaEphemeralWorker } from "../../src/infrastructure/persistence/persona-v2/ephemeral-worker.js";
import { PostgresPersonaRetentionWorker } from "../../src/infrastructure/persistence/persona-v2/retention-worker.js";

const base = new URL(personaV2TestDatabaseUrl()),
  adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const cleanup: (() => Promise<void>)[] = [];
const crypto = new NodeCryptoAdapter("01".repeat(32));
const origin = "https://persona.fixture.test";
afterAll(async () => {
  for (const action of cleanup.reverse()) await action();
  await admin.end();
});

async function fixture() {
  const name = `persona_outbox_${randomUUID().replaceAll("-", "")}_test`,
    url = new URL(base);
  url.pathname = `/${name}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const db = new pg.Pool({ connectionString: url.toString() });
  cleanup.push(async () => {
    await db.end();
    await admin.query(`DROP DATABASE "${name}"`);
  });
  await applyPersonaMigrations(url.toString());
  await applyPersonaMigrations(url.toString());
  const provider = await notificationProviderFixture();
  cleanup.push(provider.close);
  let client = "notification-owner",
    active = true;
  const runtime = await composePersonaV2(
    testConfig({
      PUBLIC_BASE_URL: origin,
      DATABASE_URL: url.toString(),
      MCP_ENCRYPTION_KEY: "01".repeat(32),
    }),
    {
      ownerAuth: {
        hubOrigin: "https://hub.fixture.test",
        login: async () => ({ accessToken: "fixture-jwt" }),
        profile: async () => ({ clientId: client, active }),
      },
      notificationTransport: provider.transport,
    },
  );
  cleanup.push(runtime.close);
  const login = await request(runtime.app)
    .post("/api/admin/login")
    .set("Host", "persona.fixture.test")
    .set("Origin", origin)
    .send({ email: "fixture@example.test", password: "fixture-only" })
    .expect(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const headers = {
    Host: "persona.fixture.test",
    Origin: origin,
    Cookie: cookie,
    "x-csrf-token": String(login.body.csrfToken),
  };
  const created = await request(runtime.app)
    .post("/api/admin/personas")
    .set(headers)
    .send({ name: "Fixture", specialty: "Sintética", instructions: "" })
    .expect(201);
  const persona = created.body.persona.id as string;
  const endpoint = `/api/admin/personas/${persona}/notifications`;
  const configure = (expectedVersion = 0, on = true) =>
    request(runtime.app)
      .post(endpoint)
      .set(headers)
      .send({
        expectedVersion,
        active: on,
        confirmed: true,
        events: ["knowledge.review_due", "sql.operation_state", "external.action_state"],
        ...(on
          ? {
              destination: "https://fixture.example.com/notification",
              secret: fixtureNotificationSecret,
            }
          : {}),
      });
  const review = async (materialize = true, delaySeconds = -1) => {
    const owner = (await db.query("SELECT responsavel_id FROM persona WHERE id=$1", [persona]))
      .rows[0].responsavel_id as string;
    const skill = randomUUID(),
      pub = randomUUID(),
      hash = createHash("sha256").update(pub).digest("hex");
    await db.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$1::uuid::text,'consulta','Fixture','{}')",
      [skill, persona],
    );
    await db.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
      [pub, persona, skill, hash],
    );
    await db.query(
      `INSERT INTO knowledge_review_v2(kind,publication_id,hash,persona_id,private_publication_id,version,due_at,owner_id,decided_at,decision,reason)
      VALUES('privado',$1,$2,$3,$1,1,now()+$5*interval '1 second',$4,now(),'configurar','Fixture')`,
      [pub, hash, persona, owner, delaySeconds],
    );
    if (!materialize) return pub;
    const r = await new PersonaReviewWorker(
      new PostgresReviewWorker(db),
      randomUUID(),
      () => new Date(),
    ).runOnce();
    expect(r.created).toBe(1);
    return (
      await db.query("SELECT id FROM knowledge_review_task_v2 WHERE publication_id=$1", [pub])
    ).rows[0].id as string;
  };
  const port = new PostgresPersonaOutbox(db),
    worker = () => new PersonaOutboxWorker(port, crypto, provider.transport);
  return {
    db,
    url,
    runtime,
    provider,
    persona,
    endpoint,
    headers,
    configure,
    review,
    port,
    worker,
    setClient: (v: string) => {
      client = v;
    },
    revoke: () => {
      active = false;
    },
  };
}

it("configuração humana, CSRF, CAS, autoridade e histórico não revelam segredo/destino", async () => {
  const f = await fixture();
  expect((await request(f.runtime.app).get(f.endpoint).set(f.headers)).body).toMatchObject({
    configured: false,
    version: 0,
  });
  await request(f.runtime.app)
    .post(f.endpoint)
    .set({ ...f.headers, "x-csrf-token": "wrong" })
    .send({})
    .expect(403);
  const saved = await f.configure().expect(200);
  expect(saved.text).not.toContain(fixtureNotificationSecret);
  expect(saved.text).not.toContain("fixture.example.com");
  await f.configure(0).expect(409);
  f.setClient("other-owner");
  await f.configure(1).expect(401);
  const otherLogin = await request(f.runtime.app)
    .post("/api/admin/login")
    .set("Host", "persona.fixture.test")
    .set("Origin", origin)
    .send({ email: "other@example.test", password: "fixture-only" })
    .expect(200);
  const otherCookie = (otherLogin.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  await request(f.runtime.app)
    .get(f.endpoint)
    .set({ ...f.headers, Cookie: otherCookie, "x-csrf-token": String(otherLogin.body.csrfToken) })
    .expect(403);
  const audit = await f.db.query(
    "SELECT * FROM audit_v2 WHERE persona_id=$1 AND evento='notification.configured'",
    [f.persona],
  );
  expect(audit.rows).toHaveLength(1);
  expect(JSON.stringify(audit.rows)).not.toContain(fixtureNotificationSecret);
});

it("evento transacional, TLS/HMAC e dois workers entregam só uma cópia e metadados", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  const results = await Promise.all([f.worker().runOnce(), f.worker().runOnce()]);
  expect(results.reduce((n, r) => n + r.delivered, 0)).toBe(1);
  expect(f.provider.state.requests).toBe(1);
  expect(f.provider.state.invalid).toBe(0);
  const [event] = Object.values(await f.provider.read());
  expect(event?.copies).toBe(1);
  const body = JSON.parse(event!.body);
  expect(Object.keys(body).sort()).toEqual([
    "event",
    "id",
    "metadata",
    "occurredAt",
    "personaId",
    "schema",
  ]);
  expect(Object.keys(body.metadata).sort()).toEqual([
    "calendarVersion",
    "dueAt",
    "publicationId",
    "taskId",
  ]);
  const list = await request(f.runtime.app)
    .get(`${f.endpoint}/deliveries`)
    .set(f.headers)
    .expect(200);
  expect(list.body.items[0]).toMatchObject({ state: "entregue", attempts: 1 });
  expect(list.text).not.toContain(event!.body);
  expect(list.text).not.toContain("fixture.example.com");
  await expect(
    f.db.query("DELETE FROM outbox_v2 WHERE notification_version IS NOT NULL"),
  ).rejects.toThrow();
});

it("claim abandonado retoma com fencing; confirmação perdida repete ID/corpo, nunca operação", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  const first = (await f.port.claim())!;
  expect(await f.port.claim()).toBeNull();
  await f.db.query(
    "UPDATE outbox_v2 SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [first.id],
  );
  const resumedPool = new pg.Pool({
    connectionString: f.url.toString(),
    options: "-c timezone=America/Cuiaba",
  });
  cleanup.push(() => resumedPool.end());
  const reopened = new PostgresPersonaOutbox(resumedPool),
    second = (await reopened.claim())!;
  expect(second.id).toBe(first.id);
  expect(second.claim).not.toBe(first.claim);
  expect(second.body).toBe(first.body);
  expect(await f.port.finish(first, true)).toBe(false);
  // Simulate a worker dying after provider acceptance, before the local acknowledgement.
  await f.provider.transport.deliver(
    {
      id: second.id,
      body: second.body,
      destination: crypto.decrypt(second.destinationEnc),
      secret: crypto.decrypt(second.secretEnc),
      signal: AbortSignal.timeout(5000),
    },
    async () => {
      expect(await reopened.authorize(second)).toBe(true);
    },
  );
  await f.db.query(
    "UPDATE outbox_v2 SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [second.id],
  );
  expect((await f.worker().runOnce()).delivered).toBe(1);
  expect((await f.provider.read())[first.id]!.copies).toBe(2);
  expect((await f.db.query("SELECT count(*)::int AS n FROM operacao_v2")).rows[0].n).toBe(0);
});

it("perda de resposta, backoff e orçamento de dez tentativas terminam sem rearmar", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  f.provider.state.loseReply = true;
  expect((await f.worker().runOnce()).failed).toBe(1);
  expect(await f.port.claim()).toBeNull();
  for (let n = 1; n < 10; n++) {
    await f.db.query(
      "UPDATE outbox_v2 SET available_at=clock_timestamp() WHERE notification_version IS NOT NULL AND estado='pendente'",
    );
    expect((await f.worker().runOnce()).failed).toBe(1);
  }
  const rows = await f.db.query(
    "SELECT estado,tentativas,failure_code FROM outbox_v2 WHERE notification_version IS NOT NULL",
  );
  expect(rows.rows).toEqual([
    { estado: "dead_letter", tentativas: 10, failure_code: "delivery_failed" },
  ]);
  expect(f.provider.state.requests).toBe(10);
  await expect(
    f.db.query("UPDATE outbox_v2 SET estado='pendente' WHERE notification_version IS NOT NULL"),
  ).rejects.toThrow();
});

it("revogação após DNS bloqueia POST, suspensão não reativa assinatura na recuperação", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  f.provider.state.beforeDns = async () => {
    await f.configure(1, false).expect(200);
  };
  expect((await f.worker().runOnce()).stale).toBe(1);
  expect(f.provider.state.requests).toBe(0);
  f.provider.state.beforeDns = () => Promise.resolve();
  await f.configure(2).expect(200);
  await f.review();
  await f.db.query(
    "UPDATE persona SET ativa=false,authorization_version=authorization_version+1 WHERE id=$1",
    [f.persona],
  );
  await f.db.query(
    "UPDATE persona SET ativa=true,authorization_version=authorization_version+1 WHERE id=$1",
    [f.persona],
  );
  expect((await request(f.runtime.app).get(f.endpoint).set(f.headers)).body).toMatchObject({
    active: false,
    version: 4,
  });
  expect((await f.worker().runOnce()).claimed).toBe(0);
});

it("DNS privado/misto, redirects e resposta excessiva recusam sem seguir destino", async () => {
  const f = await fixture();
  for (const value of [
    "http://fixture.example.com",
    "https://fixture.example.com?a=b",
    "https://user:password@fixture.example.com",
    "https://fixture.example.com:444",
  ])
    expect(() => notificationUrl(value)).toThrow();
  f.provider.state.addresses.push({ address: "127.0.0.1", family: 4 });
  await f.configure().expect(409);
  f.provider.state.addresses.pop();
  await f.configure().expect(200);
  await f.review();
  f.provider.state.status = 302;
  expect((await f.worker().runOnce()).failed).toBe(1);
  expect(f.provider.state.requests).toBe(1);
  await f.db.query("UPDATE outbox_v2 SET available_at=clock_timestamp() WHERE estado='pendente'");
  f.provider.state.status = 200;
  f.provider.state.oversized = true;
  expect((await f.worker().runOnce()).failed).toBe(1);
  expect(f.provider.state.requests).toBe(2);
});

it("queda real do processo após recebimento retoma o mesmo evento sem novo lançamento", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  let accepted!: () => void, release!: () => void;
  const received = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.provider.state.beforeReply = async () => {
    accepted();
    await hold;
  };
  const start = () =>
    spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("../helpers/persona-outbox-process.ts", import.meta.url)),
      ],
      {
        env: {
          ...process.env,
          PERSONA_V2_TEST_DATABASE_URL: f.url.toString(),
          PERSONA_OUTBOX_FIXTURE_PORT: String(f.provider.port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  const first = start();
  const terminated = once(first, "exit");
  try {
    await Promise.race([
      received,
      terminated.then(() => {
        throw new Error("Fixture process ended before provider acceptance");
      }),
      new Promise<never>((_r, reject) => {
        const timer = setTimeout(() => reject(new Error("Fixture acceptance timeout")), 10000);
        timer.unref();
      }),
    ]);
  } finally {
    first.kill();
    await terminated;
    release();
  }
  f.provider.state.beforeReply = () => Promise.resolve();
  const row = (
    await f.db.query(
      "SELECT id,estado,tentativas FROM outbox_v2 WHERE notification_version IS NOT NULL",
    )
  ).rows[0];
  expect(row).toMatchObject({ estado: "pendente", tentativas: 1 });
  await f.db.query(
    "UPDATE outbox_v2 SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [row.id],
  );
  const second = start();
  let output = "";
  second.stdout.on("data", (data: Buffer) => {
    output += data.toString();
  });
  const [code] = await once(second, "exit");
  expect(code).toBe(0);
  expect(JSON.parse(output)).toMatchObject({ delivered: 1 });
  const ledger = await f.provider.read();
  expect(Object.keys(ledger)).toEqual([row.id]);
  expect(ledger[row.id]!.copies).toBe(2);
});

async function operationFixture(
  f: Awaited<ReturnType<typeof fixture>>,
  external: boolean,
  id = randomUUID(),
) {
  const token = randomUUID(),
    skill = randomUUID(),
    pub = randomUUID();
  const hash = createHash("sha256").update(token).digest("hex"),
    encrypted = crypto.encrypt("private synthetic operation input");
  await f.db.query(
    "INSERT INTO persona_token(id,persona_id,nome,token_hash,permissoes,delegacao) VALUES($1,$2,'Fixture',$3,'{}','{}')",
    [token, f.persona, hash],
  );
  await f.db.query(
    "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$1::uuid::text,$3,'Fixture','{}')",
    [skill, f.persona, external ? "acao_externa" : "operacao_sql"],
  );
  await f.db.query(
    "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,'{}',$4)",
    [pub, f.persona, skill, hash],
  );
  if (external) {
    const integration = randomUUID();
    await f.db.query(
      "INSERT INTO integracao(id,persona_id,nome,tipo,destino,credencial_enc) VALUES($1,$2,'Fixture','rest','https://fixture.example.com',$3)",
      [integration, f.persona, encrypted],
    );
    await f.db.query(
      `INSERT INTO external_action_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,fingerprint,identity_snapshot,authorization_hash,estado,exige_aprovacao,expires_at,payload_enc)
      VALUES($1,$2,$3,$4,$5,$6,$7,'{}',$7,'preparada',false,now()+interval '15 minutes',$8)`,
      [id, f.persona, token, skill, pub, integration, hash, encrypted],
    );
  } else {
    const source = randomUUID(),
      physical = randomUUID(),
      credential = randomUUID();
    await f.db.query("INSERT INTO fonte_fisica(id,identity_hash) VALUES($1,$2)", [physical, hash]);
    await f.db.query(
      "INSERT INTO fonte_credencial(id,persona_id,email_enc,senha_enc,client_token_enc) VALUES($1,$2,$3,$3,$3)",
      [credential, f.persona, encrypted],
    );
    await f.db.query(
      "INSERT INTO fonte(id,persona_id,fonte_fisica_id,credencial_id,agent_id,banco,dialeto,nome,finalidade,ambiente) VALUES($1,$2,$3,$4,$5,'fixture','postgres','Fixture','Teste','test')",
      [source, f.persona, physical, credential, randomUUID()],
    );
    await f.db.query(
      `INSERT INTO operacao_v2(id,persona_id,token_id,publicacao_id,fonte_id,fingerprint,authorization_snapshot,estado,expires_at,payload_enc)
      VALUES($1,$2,$3,$4,$5,$6,'{}','preparada',now()+interval '15 minutes',$7)`,
      [id, f.persona, token, pub, source, hash, encrypted],
    );
  }
  return { id, table: external ? "external_action_v2" : "operacao_v2" };
}

it("outbox de transição SQL/externa é atômico, ignora estado obsoleto e não divulga receipt", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  const sharedOperationId = randomUUID();
  for (const external of [false, true]) {
    const op = await operationFixture(f, external, sharedOperationId);
    const db = await f.db.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        `UPDATE ${op.table} SET estado='executando',versao=versao+1${external ? ",claimed_at=now()" : ""} WHERE id=$1`,
        [op.id],
      );
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM outbox_v2 WHERE aggregate_ids=ARRAY[$1::uuid] AND evento=$2",
            [op.id, external ? "external.action_state" : "sql.operation_state"],
          )
        ).rows[0].n,
      ).toBe(1);
      await db.query("ROLLBACK");
    } finally {
      db.release();
    }
    expect(
      (
        await f.db.query(
          "SELECT count(*)::int AS n FROM outbox_v2 WHERE aggregate_ids=ARRAY[$1::uuid] AND evento=$2",
          [op.id, external ? "external.action_state" : "sql.operation_state"],
        )
      ).rows[0].n,
    ).toBe(0);
    await f.db.query(
      `UPDATE ${op.table} SET estado='executando',versao=versao+1${external ? ",claimed_at=now()" : ""} WHERE id=$1`,
      [op.id],
    );
    await f.db.query(
      `UPDATE ${op.table} SET estado='resultado_desconhecido',versao=versao+1,comprovante='{"private":"not for notification"}' WHERE id=$1`,
      [op.id],
    );
  }
  expect((await f.worker().runOnce()).delivered).toBe(2);
  for (const entry of Object.values(await f.provider.read())) {
    expect(JSON.parse(entry.body).metadata.state).toBe("resultado_desconhecido");
    expect(entry.body).not.toContain("not for notification");
    expect(entry.body).not.toContain("private synthetic");
  }
  expect(
    (await f.db.query("SELECT count(*)::int AS n FROM outbox_v2 WHERE estado='dead_letter'"))
      .rows[0].n,
  ).toBe(2);
});

it("expiração do orçamento e tarefa encerrada não enviam avisos obsoletos; legado nunca entra na fila v2", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  const task = await f.review();
  const row = (await f.port.claim())!;
  await f.db.query("UPDATE knowledge_review_task_v2 SET closed_at=now() WHERE id=$1", [task]);
  expect(await f.port.authorize(row)).toBe(false);
  expect(await f.port.finish(row, false)).toBe(true);
  await f.review();
  expect((await f.worker().runOnce()).delivered).toBe(1);
  const currentId = (await f.db.query("SELECT id FROM outbox_v2 WHERE estado='entregue'")).rows[0]
    .id as string;
  await f.db.query(
    `INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,destino_enc,segredo_enc,estado,notification_version,event_key,metadata,created_at)
    SELECT $1,persona_id,evento,aggregate_ids,destino_enc,segredo_enc,'pendente',notification_version,'expired-fixture',metadata,now()-interval '25 hours' FROM outbox_v2 WHERE id=$2`,
    [randomUUID(), currentId],
  );
  await f.db.query(
    "INSERT INTO outbox_v2(id,persona_id,evento,aggregate_ids,destino_enc,segredo_enc,estado) VALUES($1,$2,'legacy-fixture','{}',$3,$3,'pendente')",
    [randomUUID(), f.persona, crypto.encrypt("legacy fixture")],
  );
  expect((await f.worker().runOnce()).claimed).toBe(0);
  expect(f.provider.state.requests).toBe(1);
  expect(
    (await f.db.query("SELECT estado FROM outbox_v2 WHERE notification_version IS NULL")).rows[0]
      .estado,
  ).toBe("pendente");
});

it("revogação do responsável durante DNS bloqueia configuração e auditoria por rollback", async () => {
  const f = await fixture();
  f.provider.state.beforeDns = () => {
    f.revoke();
    return Promise.resolve();
  };
  await f.configure().expect(401);
  expect(
    (await f.db.query("SELECT count(*)::int AS n FROM persona_notification_endpoint_v2")).rows[0].n,
  ).toBe(0);
  expect(
    (
      await f.db.query(
        "SELECT count(*)::int AS n FROM audit_v2 WHERE evento='notification.configured'",
      )
    ).rows[0].n,
  ).toBe(0);
  expect(f.provider.state.requests).toBe(0);
});

it("rotação parcial do cofre não impede registrar estado/aviso; retomada usa segredo preservado", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  const op = await operationFixture(f, false);
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='persona_v2_vault_operator') THEN CREATE ROLE persona_v2_vault_operator NOLOGIN; END IF; END $$",
  );
  const next = new NodeCryptoAdapter("02".repeat(32), "notification-next", {
    primary: "01".repeat(32),
  });
  const rotation = new PersonaVaultRotation(
    new PostgresPersonaVaultRotationStore(f.url.toString()),
    next,
  );
  const paused = await rotation.run({
    apply: true,
    keyId: "notification-next",
    confirmDatabase: f.url.pathname.slice(1),
    maxBatches: 1,
  });
  expect(paused.status).toBe("running");
  await f.db.query("UPDATE operacao_v2 SET estado='executando',versao=versao+1 WHERE id=$1", [
    op.id,
  ]);
  expect(
    (
      await f.db.query(
        "SELECT destino_enc,segredo_enc FROM outbox_v2 WHERE notification_version IS NOT NULL",
      )
    ).rows,
  ).toEqual([{ destino_enc: null, segredo_enc: null }]);
  const completed = await rotation.run({
    apply: true,
    keyId: "notification-next",
    confirmDatabase: f.url.pathname.slice(1),
    resumeId: paused.runId,
  });
  expect(completed.status).toBe("completed");
  expect(
    (await new PersonaOutboxWorker(f.port, next, f.provider.transport).runOnce()).delivered,
  ).toBe(1);
  expect(f.provider.state.invalid).toBe(0);
});

interface WorkerMessage {
  type: string;
  level?: string;
  message?: string;
  fields?: Record<string, number | string>;
}
async function startWorker(f: Awaited<ReturnType<typeof fixture>>) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("../helpers/persona-worker-process.ts", import.meta.url)),
    ],
    {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "test",
        PERSONA_V2_TEST_DATABASE_URL: f.url.toString(),
        PERSONA_OUTBOX_FIXTURE_PORT: String(f.provider.port),
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  const messages: WorkerMessage[] = [];
  child.on("message", (message: WorkerMessage) => messages.push(message));
  const wait = async (predicate: (m: WorkerMessage) => boolean, timeoutMs = 10000) => {
    if (messages.some(predicate)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => done(new Error("Worker fixture progress timeout")), timeoutMs);
      const update = (m: WorkerMessage) => {
        if (predicate(m)) done();
      };
      const exited = () => done(new Error("Worker fixture exited before progress"));
      const done = (error?: Error) => {
        clearTimeout(timer);
        child.off("message", update);
        child.off("exit", exited);
        child.off("error", done);
        if (error) reject(error);
        else resolve();
      };
      child.on("message", update);
      child.once("exit", exited);
      child.once("error", done);
    });
  };
  const kill = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  };
  cleanup.push(kill);
  await wait((m) => m.type === "ready");
  return {
    messages,
    wait,
    kill,
    start: () => child.send("start"),
    stop: async () => {
      const exited = once(child, "exit");
      child.send("stop");
      await wait((m) => m.type === "stopped");
      const [code] = await exited;
      expect(code).toBe(0);
    },
  };
}

it("relógios divergentes não roubam ou prolongam leases nem antecipam tarefas de revisão", async () => {
  const f = await fixture();
  const futurePublication = await f.review(false, 3600);
  const activeTask = await f.review();
  for (const [port, table] of [
    [new PostgresReviewWorker(f.db), "persona_review_worker_lease_v2"],
    [new PostgresPersonaEphemeralWorker(f.db), "persona_ephemeral_worker_lease_v2"],
    [new PostgresPersonaRetentionWorker(f.db), "persona_retention_worker_lease_v2"],
  ] as const) {
    const first = randomUUID(),
      second = randomUUID(),
      now = new Date(),
      skew = new Date(Date.now() + 86400000);
    expect(await port.claim(first, now, skew)).toBe(true);
    expect(await port.claim(second, skew, new Date(skew.getTime() + 30000))).toBe(false);
    const duration = (
      await f.db.query(
        `SELECT extract(epoch FROM (expires_at-clock_timestamp())) AS seconds FROM ${table}`,
      )
    ).rows[0].seconds;
    expect(Number(duration)).toBeGreaterThan(0);
    expect(Number(duration)).toBeLessThanOrEqual(30);
    await f.db.query(`UPDATE ${table} SET expires_at=clock_timestamp()-interval '1 second'`);
    const behind = new Date(Date.now() - 86400000);
    expect(await port.claim(second, behind, new Date(behind.getTime() + 30000))).toBe(true);
    await port.release(first);
    await expect(port.process(first, now)).rejects.toThrow("lease expired");
    await port.process(second, behind);
    await port.process(second, skew);
    await port.release(second);
    await expect(port.claim(first, now, new Date(NaN))).rejects.toThrow("Invalid worker lease");
  }
  expect(
    (
      await f.db.query("SELECT id FROM knowledge_review_task_v2 WHERE publication_id=$1", [
        futurePublication,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (await f.db.query("SELECT closed_at FROM knowledge_review_task_v2 WHERE id=$1", [activeTask]))
      .rows[0],
  ).toEqual({ closed_at: null });
});

it("dois processos executam os quatro jobs; falha de revisão não impede manutenção e reinício retoma sem duplicar", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  for (let i = 0; i < 6; i++) await f.review(false);
  const op = await operationFixture(f, false);
  await f.db.query("UPDATE operacao_v2 SET estado='executando',versao=versao+1 WHERE id=$1", [
    op.id,
  ]);
  await f.db.query(
    "UPDATE operacao_v2 SET estado='resultado_desconhecido',versao=versao+1 WHERE id=$1",
    [op.id],
  );
  const snapshot = (
    await f.db.query("SELECT estado,payload_enc,versao,terminal_at FROM operacao_v2 WHERE id=$1", [
      op.id,
    ])
  ).rows[0];
  const token = (await f.db.query("SELECT token_id FROM operacao_v2 WHERE id=$1", [op.id])).rows[0]
    .token_id;
  await f.db.query(
    "INSERT INTO setup_v2(code_hash,persona_id,token_id,finalidade,csrf_hash,expires_at,contexto_enc) VALUES($1,$2,$3,'fixture',$1,now()-interval '1 second','fixture-ciphertext')",
    [createHash("sha256").update(randomUUID()).digest("hex"), f.persona, token],
  );
  await f.db.query(`CREATE FUNCTION fixture_review_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'private fixture error, never log'; END $$;
    CREATE TRIGGER fixture_review_failure BEFORE INSERT ON knowledge_review_task_v2 FOR EACH ROW EXECUTE FUNCTION fixture_review_failure()`);
  const first = await startWorker(f),
    second = await startWorker(f);
  first.start();
  second.start();
  for (const process of [first, second])
    await process.wait((m) => m.message === "persona outbox worker completed");
  await first.stop();
  await second.stop();
  expect((await f.db.query("SELECT count(*)::int n FROM setup_v2")).rows[0].n).toBe(0);
  expect((await f.db.query("SELECT count(*)::int n FROM knowledge_review_task_v2")).rows[0].n).toBe(
    0,
  );
  const logs = [...first.messages, ...second.messages];
  expect(logs.some((m) => m.level === "error" && m.fields?.stage === "knowledge_review")).toBe(
    true,
  );
  expect(JSON.stringify(logs)).not.toMatch(
    /private fixture|fixture-ciphertext|private synthetic|notification_secret|fixture\.example\.com/,
  );
  await f.db.query(
    "DROP TRIGGER fixture_review_failure ON knowledge_review_task_v2; DROP FUNCTION fixture_review_failure()",
  );
  const resumed = await startWorker(f),
    companion = await startWorker(f);
  resumed.start();
  companion.start();
  await resumed.wait((m) => m.message === "persona outbox worker completed");
  await companion.wait((m) => m.message === "persona outbox worker completed");
  await resumed.stop();
  await companion.stop();
  expect((await f.db.query("SELECT count(*)::int n FROM knowledge_review_task_v2")).rows[0].n).toBe(
    6,
  );
  expect(
    (await f.db.query("SELECT count(*)::int n FROM knowledge_review_notification_v2")).rows[0].n,
  ).toBe(6);
  const ledger = await f.provider.read();
  expect(Object.keys(ledger)).toHaveLength(7);
  expect(Object.values(ledger).every((entry) => entry.copies === 1 && entry.effects === 1)).toBe(
    true,
  );
  expect(f.provider.state.invalid).toBe(0);
  expect(
    (
      await f.db.query(
        "SELECT estado,payload_enc,versao,terminal_at FROM operacao_v2 WHERE id=$1",
        [op.id],
      )
    ).rows[0],
  ).toEqual(snapshot);
  const final = await startWorker(f);
  final.start();
  await final.wait((m) => m.message === "persona outbox worker completed");
  await final.stop();
  expect(await f.provider.read()).toEqual(ledger);
}, 45000);

it("queda de uma instância durante POST conserva claim; sucessora aguarda lease real e receptor deduplica", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  let accepted!: () => void, release!: () => void;
  const received = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.provider.state.beforeReply = async () => {
    accepted();
    await hold;
  };
  const first = await startWorker(f),
    survivor = await startWorker(f);
  first.start();
  try {
    await received;
    survivor.start();
    await survivor.wait((m) => m.message === "persona outbox worker completed");
    expect(f.provider.state.requests).toBe(1);
    await first.kill();
  } finally {
    release();
    f.provider.state.beforeReply = () => Promise.resolve();
  }
  const pending = (
    await f.db.query(
      "SELECT id,tentativas,estado FROM outbox_v2 WHERE notification_version IS NOT NULL",
    )
  ).rows[0];
  expect(pending).toMatchObject({ tentativas: 1, estado: "pendente" });
  // No fixture clock override: another process must wait for the actual 30-second database lease.
  await survivor.wait(
    (m) => m.message === "persona outbox worker completed" && Number(m.fields?.delivered) === 1,
    35000,
  );
  await survivor.stop();
  const entry = (await f.provider.read())[pending.id]!;
  expect(entry).toMatchObject({ copies: 2, effects: 1 });
  expect(
    (await f.db.query("SELECT tentativas,estado FROM outbox_v2 WHERE id=$1", [pending.id])).rows[0],
  ).toEqual({ tentativas: 2, estado: "entregue" });
  expect((await f.db.query("SELECT count(*)::int n FROM operacao_v2")).rows[0].n).toBe(0);
}, 45000);

it("duas instâncias enviam eventos distintos simultaneamente sem lock global ou claim duplicado", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  await f.review();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.provider.state.beforeReply = () => hold;
  const first = await startWorker(f),
    second = await startWorker(f);
  first.start();
  second.start();
  try {
    // Both POSTs must reach the native receiver while neither has received a response.
    await expect.poll(() => f.provider.state.requests, { timeout: 10000 }).toBe(2);
    const claimed = await f.db.query(
      "SELECT id,lease_owner,tentativas FROM outbox_v2 WHERE notification_version IS NOT NULL ORDER BY id",
    );
    expect(claimed.rows).toHaveLength(2);
    expect(new Set(claimed.rows.map((row) => row.lease_owner)).size).toBe(2);
    expect(claimed.rows.every((row) => row.lease_owner && row.tentativas === 1)).toBe(true);
  } finally {
    release();
    f.provider.state.beforeReply = () => Promise.resolve();
  }
  for (const process of [first, second]) {
    await process.wait(
      (m) => m.message === "persona outbox worker completed" && Number(m.fields?.delivered) === 1,
    );
    await process.stop();
  }
  expect(
    Object.values(await f.provider.read()).map((entry) => ({
      copies: entry.copies,
      effects: entry.effects,
    })),
  ).toEqual([
    { copies: 1, effects: 1 },
    { copies: 1, effects: 1 },
  ]);
  expect(f.provider.state.invalid).toBe(0);
});

it("parada no primeiro POST aguarda confirmação e não inicia outra entrega do lote", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review();
  await f.review();
  let accepted!: () => void, release!: () => void;
  const received = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.provider.state.beforeReply = async () => {
    accepted();
    await hold;
  };
  const first = await startWorker(f);
  first.start();
  let stopping: Promise<void> | undefined;
  try {
    await received;
    stopping = first.stop();
    // IPC shares the same stop path as signals; Windows kill() itself is abrupt.
    await expect.poll(() => first.messages.some((m) => m.type === "stopping")).toBe(true);
    expect(first.messages.some((m) => m.type === "stopped")).toBe(false);
    expect(f.provider.state.requests).toBe(1);
  } finally {
    release();
    f.provider.state.beforeReply = () => Promise.resolve();
  }
  await stopping;
  expect(
    (await f.db.query("SELECT count(*)::int n FROM outbox_v2 WHERE estado='pendente'")).rows[0].n,
  ).toBe(1);
  const next = await startWorker(f);
  next.start();
  await next.wait((m) => m.message === "persona outbox worker completed");
  await next.stop();
  expect(Object.values(await f.provider.read()).map((entry) => entry.copies)).toEqual([1, 1]);
});

it("queda durante limpeza transacional desfaz o lote; segunda instância retoma após lease sem duplicar revisão", async () => {
  const f = await fixture();
  await f.configure().expect(200);
  await f.review(false);
  const op = await operationFixture(f, false);
  const token = (await f.db.query("SELECT token_id FROM operacao_v2 WHERE id=$1", [op.id])).rows[0]
    .token_id;
  for (let i = 0; i < 2; i++) {
    await f.db.query(
      "INSERT INTO setup_v2(code_hash,persona_id,token_id,finalidade,csrf_hash,expires_at,contexto_enc) VALUES($1,$2,$3,'fixture',$1,now()-interval '1 second','fixture-ciphertext')",
      [createHash("sha256").update(randomUUID()).digest("hex"), f.persona, token],
    );
  }
  await f.db.query(`CREATE FUNCTION fixture_hold_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(19370031,1); RETURN OLD; END $$;
    CREATE TRIGGER fixture_hold_cleanup AFTER DELETE ON setup_v2 FOR EACH ROW EXECUTE FUNCTION fixture_hold_cleanup()`);
  const gate = await f.db.connect();
  let successor: Awaited<ReturnType<typeof startWorker>> | undefined;
  let abandonedPid: number | undefined;
  try {
    await gate.query("SELECT pg_advisory_lock(19370031,1)");
    const first = await startWorker(f);
    first.start();
    await expect
      .poll(
        async () =>
          (
            await f.db.query(
              "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
            )
          ).rows[0].n,
        { timeout: 10000 },
      )
      .toBe(1);
    abandonedPid = (
      await f.db.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
      )
    ).rows[0]!.pid;
    successor = await startWorker(f);
    successor.start();
    await first.kill();
  } finally {
    // PostgreSQL may detect a dead client only after its blocked statement returns.
    // Releasing our test gate is not a cancellation guarantee of the worker.
    await gate.query("SELECT pg_advisory_unlock(19370031,1)");
    gate.release();
  }
  await expect
    .poll(
      async () =>
        (
          await f.db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE pid=$1", [
            abandonedPid,
          ])
        ).rows[0].n,
      { timeout: 5000 },
    )
    .toBe(0);
  expect((await f.db.query("SELECT count(*)::int n FROM setup_v2")).rows[0].n).toBe(2);
  await successor.wait(
    (m) => m.message === "persona ephemeral worker completed" && Number(m.fields?.setups) === 2,
    35000,
  );
  await successor.wait((m) => m.message === "persona outbox worker completed");
  await successor.stop();
  expect((await f.db.query("SELECT count(*)::int n FROM setup_v2")).rows[0].n).toBe(0);
  expect((await f.db.query("SELECT count(*)::int n FROM knowledge_review_task_v2")).rows[0].n).toBe(
    1,
  );
  expect(Object.values(await f.provider.read())).toMatchObject([{ copies: 1, effects: 1 }]);
  expect(
    (await f.db.query("SELECT estado,payload_enc FROM operacao_v2 WHERE id=$1", [op.id])).rows[0],
  ).toMatchObject({ estado: "preparada", payload_enc: expect.any(String) });
}, 45000);
