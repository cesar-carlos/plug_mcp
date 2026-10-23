import { randomUUID } from "node:crypto";
import pg from "pg";
import request from "supertest";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { PostgresSharedKnowledgeRepository } from "../../src/infrastructure/persistence/persona-v2/shared-knowledge.js";
import { MemoryAdministrativeSessions } from "../../src/infrastructure/persistence/persona-v2/admin-sessions.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaAdministration } from "../../src/application/persona-v2/administration.js";
import { PersonaOwnerDelegation } from "../../src/application/persona-v2/owner-delegation.js";
import { PersonaAdministrativeAuthorization } from "../../src/application/persona-v2/administrative-authorization.js";
import { PersonaSchemaInspection } from "../../src/application/persona-v2/schema-inspection.js";
import { PersonaCatalog } from "../../src/application/persona-v2/catalog.js";
import { PersonaConsumerCatalog } from "../../src/application/persona-v2/consumer-catalog.js";
import { PersonaDelegatedTokens } from "../../src/application/persona-v2/delegated-tokens.js";
import { createPersonaAdministrationApp } from "../../src/infrastructure/http/persona-v2-admin.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import { SharedKnowledge } from "../../src/application/persona-v2/shared-knowledge.js";
import { sourceSchemaResultSchema } from "../../src/domain/persona-v2/source-schema.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import type {
  Source,
  ConsumerIdentity,
  AdministrativePermission,
} from "../../src/domain/persona-v2/model.js";
import { reviewDateFixture } from "../helpers/review-deadline.js";

const url = new URL(personaV2TestDatabaseUrl()),
  controlUrl = new URL(url);
controlUrl.pathname = "/postgres";
const name = `structure_composition_${randomUUID().replaceAll("-", "")}_test`;
url.pathname = `/${name}`;
const db = new pg.Pool({ connectionString: url.toString() }),
  control = new pg.Pool({ connectionString: controlUrl.toString() });
const crypto = new NodeCryptoAdapter("ab".repeat(32)),
  repository = new PostgresPersonaRepository(db, crypto);
let now = new Date(),
  session: string,
  ownerActive = true,
  remoteAllowed = true;
let hook: () => Promise<void> = async () => undefined;
let inspectCalls = 0;
const services = {
  repository,
  crypto,
  now: () => now,
  sessions: new MemoryAdministrativeSessions(crypto),
  ownerAuth: {
    hubOrigin: "https://hub.fixture.test",
    login: async (email: string) => ({ accessToken: email }),
    profile: async (token: string) => ({ clientId: token.split("@")[0]!, active: ownerActive }),
  },
  sourceVerifier: {
    verify: async () => ({
      database: "fixture",
      dialect: "postgres" as const,
      identityHash: "f".repeat(64),
      verifiedAt: now.toISOString(),
    }),
  },
};
const admin = new PersonaAdministration(services);
const delegates = new Map<
  string,
  {
    id: string;
    personaId: string;
    audience: string;
    administrative: readonly AdministrativePermission[];
    expiresAt: string;
  }
>();
const delegation = new PersonaOwnerDelegation(
  services,
  admin,
  {
    create: async (_jwt, input) => {
      const credential = `pdv2_${"a".repeat(43)}`,
        result = {
          id: randomUUID(),
          ...input,
          expiresAt: new Date(now.getTime() + 86400000).toISOString(),
        };
      delegates.set(input.personaId, result);
      return { ...result, clientId: "owner", credential };
    },
    verify: async (_credential, input) => ({
      ...delegates.get(input.personaId)!,
      clientId: "owner",
      active: true,
    }),
    revoke: async () => undefined,
  },
  "https://mcp.fixture.test",
);
const authority = new PersonaAdministrativeAuthorization(services, admin, delegation);
const inspection = new PersonaSchemaInspection(services, authority, {
  authorize: async () => {
    if (!remoteAllowed) throw new Error("fixture authority denied");
    return {
      inspectSchema: async () => {
        inspectCalls++;
        throw new Error("No new inspection on composition");
      },
      execute: async () => {
        throw new Error("No business SQL in this fixture");
      },
      revalidate: async () => {
        await hook();
        if (!remoteAllowed) throw new Error("fixture authority denied");
      },
    };
  },
});
const shared = new SharedKnowledge(services, admin, new PostgresSharedKnowledgeRepository(db));
const catalog = new PersonaCatalog(services, admin, authority);
const app = createPersonaAdministrationApp({
  administration: admin,
  catalog,
  consumerCatalog: new PersonaConsumerCatalog(services),
  administrativeAuthorization: authority,
  delegatedTokens: new PersonaDelegatedTokens(services, authority),
  schemaInspection: inspection,
  crypto,
  publicBaseUrl: "http://127.0.0.1:3333",
  ready: async () => true,
});
async function addSource(personaId: string) {
  return admin.addSource(session, {
    personaId,
    name: "Fixture",
    purpose: "Structural fixture",
    environment: "test",
    agentId: randomUUID(),
    dialect: "postgres",
    email: "source@fixture.test",
    password: "fixture-password",
    clientToken: "fixture-token",
  });
}
async function fixture() {
  const persona = await admin.createPersona(session, {
    name: "Composição",
    specialty: "Fixture",
    instructions: "Não inventar",
  });
  const source = await addSource(persona.id);
  const resources = Array.from({ length: 6 }, (_, i) => ({
    schema: "public",
    name: `table_${i}`,
    type: "table" as const,
  }));
  const pages = [];
  for (const offset of [0, 2, 4]) {
    const evidence = sourceSchemaResultSchema.parse({
      contractVersion: 1,
      observedAt: now.toISOString(),
      identity: {
        contractVersion: 1,
        database: source.database,
        dialect: source.dialect,
        identityKind: "native",
        identityHash: source.identityHash,
        engineVersion: "fixture",
        verifiedAt: now.toISOString(),
      },
      resources: resources.slice(offset, offset + 2).map((resource) => ({
        resource,
        status: "available",
        columns: [
          {
            name: "id",
            nativeType: "int4",
            ordinal: 1,
            nullable: false,
            size: null,
            scale: null,
          },
        ],
        primaryKeys: [],
        foreignKeys: [],
        coverage: {
          columns: true,
          primaryKeys: true,
          foreignKeys: true,
          constraintStatus: false,
        },
        limitations: ["constraint_status_unverified"],
      })),
      metadataPage: { offset, pageSize: 2, nextOffset: offset === 4 ? null : offset + 2 },
    });
    const page = {
      id: randomUUID(),
      source,
      scope: { resources, offset, pageSize: 2 },
      evidence,
      hash: crypto.sha256Hex(canonicalJson(evidence)),
      expiresAt: new Date(now.getTime() + (5 + offset) * 60000),
    };
    await repository.transaction({ personaIds: [persona.id], tokenIds: [] }, (tx) =>
      tx.recordStructureEvidence(page),
    );
    pages.push(page);
  }
  return { persona, source, pages, resources, raw: { evidenceIds: pages.map((p) => p.id) } };
}
async function assertNoComposition(source: Source) {
  const count = await db.query(
    "SELECT count(*) n FROM source_structure_evidence_v2 WHERE fonte_id=$1 AND evidence ? 'composition'",
    [source.id],
  );
  expect(Number(count.rows[0].n)).toBe(0);
}
beforeAll(async () => {
  await control.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(url.toString());
});
beforeEach(async () => {
  now = new Date();
  ownerActive = true;
  remoteAllowed = true;
  inspectCalls = 0;
  hook = async () => undefined;
  session = (await admin.login("owner@fixture.test", "fixture-password")).sessionId;
});
afterAll(async () => {
  await db.end();
  // Pool shutdown may finish before PostgreSQL observes the socket close.
  // Let DROP wait normally; do not terminate a client still completing shutdown.
  await control.query(`DROP DATABASE IF EXISTS "${name}"`);
  await control.end();
});

it("persiste linhagem imutável de seis tabelas, sem ampliar validade ou reinspecionar o esquema", async () => {
  const f = await fixture(),
    result = await inspection.compose(session, f.persona.id, f.source.id, f.raw);
  expect(result.status).toBe("composed");
  if (result.status !== "composed") throw new Error("Missing composed evidence");
  expect(result.expiresAt).toBe(f.pages[0]!.expiresAt.toISOString());
  expect(result.evidence.resources).toHaveLength(6);
  expect(inspectCalls).toBe(0);
  expect(result).toMatchObject({ executable: false, semanticApproval: false });
  const links = await db.query(
    "SELECT * FROM source_structure_evidence_part_v2 WHERE evidence_id=$1 ORDER BY ordinal",
    [result.id],
  );
  expect(links.rows.map((r) => r.page_id)).toEqual(f.raw.evidenceIds);
  await expect(
    db.query("UPDATE source_structure_evidence_part_v2 SET ordinal=9 WHERE evidence_id=$1", [
      result.id,
    ]),
  ).rejects.toMatchObject({ code: "P0001" });
  const audit = await db.query(
    "SELECT * FROM audit_v2 WHERE fonte_id=$1 AND evento='source.schema_composed'",
    [f.source.id],
  );
  expect(audit.rows).toHaveLength(1);
  expect(JSON.stringify(audit.rows)).not.toContain("table_0");
  const stored = await repository.transaction({ personaIds: [f.persona.id], tokenIds: [] }, (tx) =>
    tx.structureEvidence(f.persona.id, result.id),
  );
  expect(stored!.scope.resources).toHaveLength(6);
});
it("lacuna não grava composição e páginas de outra persona/fonte são recusadas", async () => {
  const f = await fixture();
  expect(
    await inspection.compose(session, f.persona.id, f.source.id, {
      evidenceIds: [f.pages[0]!.id, f.pages[2]!.id],
    }),
  ).toMatchObject({ status: "inconclusive", issues: ["PAGES_GAP"] });
  const other = await fixture();
  await expect(
    inspection.compose(session, f.persona.id, f.source.id, {
      evidenceIds: [f.pages[0]!.id, other.pages[1]!.id],
    }),
  ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  const second = await addSource(f.persona.id);
  await expect(inspection.compose(session, f.persona.id, second.id, f.raw)).rejects.toMatchObject({
    code: "STALE_AUTHORIZATION",
  });
  await assertNoComposition(f.source);
});
it("constraints de persistência recusam reaproveitar páginas de outra fonte ou hash", async () => {
  const f = await fixture(),
    second = await addSource(f.persona.id);
  const good = await inspection.compose(session, f.persona.id, f.source.id, f.raw);
  if (good.status !== "composed") throw new Error("Missing composition");
  await expect(
    repository.transaction({ personaIds: [f.persona.id], tokenIds: [] }, (tx) =>
      tx.recordStructureEvidence({
        id: randomUUID(),
        source: second,
        scope: f.pages[0]!.scope,
        evidence: good.evidence,
        hash: good.hash,
        expiresAt: new Date(good.expiresAt),
      }),
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    db.query(
      `INSERT INTO source_structure_evidence_part_v2
    (persona_id,evidence_id,page_id,ordinal,fonte_id,source_version,credential_version,identity_hash,parent_hash,page_hash)
    VALUES($1,$2,$3,9,$4,1,1,$5,$6,$7)`,
      [
        f.persona.id,
        f.pages[0]!.id,
        f.pages[1]!.id,
        f.source.id,
        f.source.identityHash,
        f.pages[0]!.hash,
        "a".repeat(64),
      ],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
it("expiração, revogação remota e alteração de fonte durante composição não gravam prova", async () => {
  const expired = await fixture();
  now = new Date(now.getTime() + 6 * 60000);
  await expect(
    inspection.compose(session, expired.persona.id, expired.source.id, expired.raw),
  ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  const revoked = await fixture();
  hook = async () => {
    remoteAllowed = false;
  };
  await expect(
    inspection.compose(session, revoked.persona.id, revoked.source.id, revoked.raw),
  ).rejects.toThrow("authority denied");
  await assertNoComposition(revoked.source);
  remoteAllowed = true;
  const changed = await fixture();
  hook = () =>
    repository.transaction({ personaIds: [changed.persona.id], tokenIds: [] }, (tx) =>
      tx.updateSource(
        {
          ...changed.source,
          authorizationVersion: 2,
        },
        1,
      ),
    );
  await expect(
    inspection.compose(session, changed.persona.id, changed.source.id, changed.raw),
  ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  await assertNoComposition(changed.source);
});
it("consumidor precisa treinar, delegação ativa e fonte concedida; revogação em voo bloqueia commit", async () => {
  const f = await fixture();
  await delegation.create(session, f.persona.id, 0, ["treinar"]);
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await admin.issueToken(session, {
    personaId: f.persona.id,
    name: "Treinador",
    permissions: { ...empty, sourceIds: [f.source.id], administrative: ["treinar"] },
    delegation: empty,
    expiresAt: null,
  });
  const identity: ConsumerIdentity = {
    personaId: f.persona.id,
    personaVersion: 1,
    tokenId: token.tokenId,
    tokenVersion: 1,
  };
  const result = await inspection.compose(identity, f.persona.id, f.source.id, f.raw);
  expect(result.status).toBe("composed");
  const denied = await admin.issueToken(session, {
    personaId: f.persona.id,
    name: "Sem fonte",
    permissions: { ...empty, administrative: ["treinar"] },
    delegation: empty,
    expiresAt: null,
  });
  await expect(
    inspection.compose({ ...identity, tokenId: denied.tokenId }, f.persona.id, f.source.id, f.raw),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  hook = () =>
    repository.transaction({ personaIds: [f.persona.id], tokenIds: [token.tokenId] }, (tx) =>
      tx.revokeToken(f.persona.id, token.tokenId, now),
    );
  await expect(
    inspection.compose(identity, f.persona.id, f.source.id, f.raw),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const count = await db.query(
    "SELECT count(*) n FROM source_structure_evidence_part_v2 WHERE fonte_id=$1",
    [f.source.id],
  );
  expect(Number(count.rows[0].n)).toBe(3);
});
it("publicação fixa evidência composta e histórico pagina somente versões adotadas e concedidas", async () => {
  const f = await fixture(),
    combined = await inspection.compose(session, f.persona.id, f.source.id, f.raw);
  if (combined.status !== "composed") throw new Error("Missing composition");
  const c = await shared.create(session, { name: "Padrão sintético" });
  const content = {
    system: "Fixture",
    label: "1",
    dialects: ["postgres"],
    tables: f.resources.map((r, i) => ({
      id: `t_${i}`,
      name: `public.${r.name}`,
      meaning: "Um registro sintético por id",
      resourceType: "table",
      grain: ["id"],
      physicalNames: [],
      columns: [
        {
          name: "id",
          meaning: "Identificador sintético",
          logicalType: "integer",
          nullable: false,
          classification: "livre",
          nativeTypes: [{ dialect: "postgres", type: "int4" }],
        },
      ],
    })),
    relationships: [],
    examples: [],
    rules: [],
  };
  const p = await shared.createPattern(session, c.id, { slug: "fixture", name: "Padrão", content });
  const preview = await shared.preview(session, c.id, p.id, reviewDateFixture());
  const publication = await shared.publish(session, c.id, p.id, {
    confirmationHash: preview.confirmationHash,
  });
  const training = {
    sourceId: f.source.id,
    dialect: "postgres",
    purpose: "Consulta sintética",
    sqlModel: "SELECT t.id FROM public.table_0 t WHERE t.id > :minimum ORDER BY t.id",
    tables: content.tables.map((t) => ({
      name: t.name,
      meaning: t.meaning,
      grain: t.grain,
      resourceType: t.resourceType,
    })),
    columns: content.tables.map((t) => ({
      table: t.name,
      name: "id",
      meaning: t.columns[0]!.meaning,
      classification: "livre",
    })),
    relationships: [],
    rules: [],
    parameters: [
      { name: "minimum", type: "integer", required: true, meaning: "Identificador mínimo" },
    ],
    sharedKnowledge: { catalogId: c.id, publicationId: publication.id, evidenceId: combined.id },
  };
  const draft = await catalog.create(session, f.persona.id, {
    kind: "consulta",
    slug: "composed-query",
    name: "Consulta",
    training,
  });
  const prepared = await catalog.preview(session, f.persona.id, draft.id, reviewDateFixture());
  const result = await catalog.publish(session, f.persona.id, draft.id, prepared.confirmationHash);
  expect(result.package.format).toBe("persona-query-v2");
  if (result.package.format !== "persona-query-v2") throw new Error("Expected query");
  expect(result.package.sharedKnowledge!.evidenceHash).toBe(combined.hash);
  expect(result.package.sharedKnowledge!.expectedStructure.resources).toHaveLength(6);
  // Old versions remain visible only through independently granted active skills.
  await shared.updatePattern(session, c.id, p.id, {
    name: p.name,
    expectedRevision: p.revision,
    content: { ...content, label: "Versão seguinte" },
  });
  const nextPreview = await shared.preview(session, c.id, p.id, reviewDateFixture());
  const nextPattern = await shared.publish(session, c.id, p.id, {
    confirmationHash: nextPreview.confirmationHash,
  });
  const publications = [result];
  for (let i = 0; i < 20; i++) {
    const nextDraft = await catalog.create(session, f.persona.id, {
      kind: "consulta",
      slug: `history-${i}`,
      name: "Consulta seguinte",
      training: {
        ...training,
        sharedKnowledge: { ...training.sharedKnowledge, publicationId: nextPattern.id },
      },
    });
    const nextReview = await catalog.preview(
      session,
      f.persona.id,
      nextDraft.id,
      reviewDateFixture(),
    );
    publications.push(
      await catalog.publish(session, f.persona.id, nextDraft.id, nextReview.confirmationHash),
    );
  }
  // A newer catalog publication does not silently become consumer history.
  await shared.updatePattern(session, c.id, p.id, {
    name: p.name,
    expectedRevision: nextPattern.revision,
    content: { ...content, label: "Versão não adotada" },
  });
  const unadoptedPreview = await shared.preview(session, c.id, p.id, reviewDateFixture());
  const unadopted = await shared.publish(session, c.id, p.id, {
    confirmationHash: unadoptedPreview.confirmationHash,
  });
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const issue = async (selected: typeof publications) => {
    const token = await admin.issueToken(session, {
      personaId: f.persona.id,
      name: "Histórico restrito",
      expiresAt: null,
      delegation: empty,
      permissions: {
        ...empty,
        sourceIds: [f.source.id],
        skills: selected.map((pub) => ({
          skillId: pub.skillId,
          capabilities: pub.package.requiredCapabilities,
          effects: ["select"],
          requireHumanApproval: false,
        })),
      },
    });
    const consumer = new PersonaConsumerCatalog(services);
    return { token, consumer, identity: await consumer.authenticate(token.bearer) };
  };
  const all = await issue(publications);
  const first = await all.consumer.knowledgeHistory(all.identity, { skillId: draft.id });
  expect(first.versions).toHaveLength(20);
  expect(first.versions.every((v) => v.publicationId === nextPattern.id)).toBe(true);
  expect(JSON.stringify(first)).not.toContain(unadopted.id);
  expect(first.nextCursor).toBeTruthy();
  const last = await all.consumer.knowledgeHistory(all.identity, {
    skillId: draft.id,
    afterSkillId: first.nextCursor,
  });
  expect(last.versions).toHaveLength(1);
  expect(last.versions[0]!.publicationId).toBe(publication.id);
  expect(last.nextCursor).toBeNull();
  expect(new Set([...first.versions, ...last.versions].map((v) => v.skillId)).size).toBe(21);
  expect(JSON.stringify(first)).not.toContain("sqlModel");
  const onlyOld = await issue([result]);
  const comparisonInput = { fromSkillId: draft.id, toSkillId: publications[1]!.skillId };
  const comparison = await all.consumer.compareKnowledge(all.identity, comparisonInput);
  expect(comparison.from.publicationId).toBe(publication.id);
  expect(comparison.to.publicationId).toBe(nextPattern.id);
  expect(comparison.catalogBrowsing).toBe(false);
  expect(comparison.grantsExecution).toBe(false);
  expect(comparison.changes.some((change) => change.section === "label")).toBe(true);
  expect(JSON.stringify(comparison)).not.toContain(unadopted.id);
  expect(
    (
      await all.consumer.compareKnowledge(all.identity, {
        fromSkillId: draft.id,
        toSkillId: draft.id,
      })
    ).changes,
  ).toEqual([]);
  const reverse = await all.consumer.compareKnowledge(all.identity, {
    fromSkillId: comparisonInput.toSkillId,
    toSkillId: comparisonInput.fromSkillId,
  });
  expect(reverse.changes).toEqual(
    comparison.changes.map((change) => ({
      section: change.section,
      before: change.after,
      after: change.before,
    })),
  );
  await expect(
    onlyOld.consumer.compareKnowledge(onlyOld.identity, comparisonInput),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    all.consumer.compareKnowledge(all.identity, {
      ...comparisonInput,
      toSkillId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(
    (await onlyOld.consumer.knowledgeHistory(onlyOld.identity, { skillId: draft.id })).versions,
  ).toHaveLength(1);
  await expect(
    onlyOld.consumer.knowledgeHistory(onlyOld.identity, {
      skillId: draft.id,
      afterSkillId: first.nextCursor,
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    onlyOld.consumer.knowledgeHistory(onlyOld.identity, { skillId: publications[1]!.skillId }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  // Exercise the actual MCP registration and strict input schema too.
  const response = await request(app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Authorization", `Bearer ${onlyOld.token.bearer}`)
    .set("Accept", "application/json, text/event-stream")
    .send({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: {
        name: "listar_historico_conhecimento",
        arguments: { skillId: draft.id },
      },
    })
    .expect(200);
  expect(JSON.stringify(parseMcpPayload(response).result)).toContain(publication.id);
  const compared = await request(app)
    .post("/mcp")
    .set("Host", "127.0.0.1:3333")
    .set("Authorization", `Bearer ${all.token.bearer}`)
    .set("Accept", "application/json, text/event-stream")
    .send({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name: "comparar_conhecimento", arguments: comparisonInput },
    })
    .expect(200);
  expect(JSON.stringify(parseMcpPayload(compared).result)).toContain(nextPattern.id);
  await shared.suspend(session, c.id, nextPattern.id);
  await expect(all.consumer.compareKnowledge(all.identity, comparisonInput)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  const remaining = await all.consumer.knowledgeHistory(all.identity, { skillId: draft.id });
  expect(remaining.versions.map((v) => v.publicationId)).toEqual([publication.id]);
  await expect(
    all.consumer.knowledgeHistory(all.identity, {
      skillId: draft.id,
      afterSkillId: first.nextCursor,
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await admin.revokeToken(session, f.persona.id, all.token.tokenId);
  await expect(
    all.consumer.knowledgeHistory(all.identity, { skillId: draft.id }),
  ).rejects.toThrow();
});

it("HTTP exige CSRF e MCP aplica concessões mesmo em chamada direta", async () => {
  const f = await fixture();
  await delegation.create(session, f.persona.id, 0, ["treinar"]);
  const root = `/api/admin/personas/${f.persona.id}/fontes/${f.source.id}/estrutura/compor`;
  const login = await request(app)
    .post("/api/admin/login")
    .set("Host", "127.0.0.1:3333")
    .set("Origin", "http://127.0.0.1:3333")
    .send({ email: "owner@fixture.test", password: "fixture-password" })
    .expect(200);
  const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const callAdmin = () =>
    request(app)
      .post(root)
      .set("Host", "127.0.0.1:3333")
      .set("Origin", "http://127.0.0.1:3333")
      .set("Cookie", cookie);
  await callAdmin().send(f.raw).expect(403);
  const response = await callAdmin()
    .set("X-CSRF-Token", login.body.csrfToken)
    .send(f.raw)
    .expect(200);
  expect(response.body.status).toBe("composed");
  const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
  const token = await admin.issueToken(session, {
    personaId: f.persona.id,
    name: "MCP",
    permissions: { ...empty, sourceIds: [f.source.id], administrative: ["treinar"] },
    delegation: empty,
    expiresAt: null,
  });
  const rpc = async (bearer: string, method: string, params: object) =>
    parseMcpPayload(
      await request(app)
        .post("/mcp")
        .set("Host", "127.0.0.1:3333")
        .set("Authorization", `Bearer ${bearer}`)
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id: randomUUID(), method, params })
        .expect(200),
    );
  const listed = await rpc(token.bearer, "tools/list", {});
  expect(JSON.stringify(listed.result)).toContain('"compor_inspecoes_estrutura"');
  const called = await rpc(token.bearer, "tools/call", {
    name: "compor_inspecoes_estrutura",
    arguments: { fonteId: f.source.id, ...f.raw },
  });
  const result = called.result as { isError?: boolean; content: { text: string }[] };
  expect(result.isError).not.toBe(true);
  expect(JSON.parse(result.content[0]!.text).status).toBe("composed");
  const reader = await admin.issueToken(session, {
    personaId: f.persona.id,
    name: "Leitor",
    permissions: { ...empty, sourceIds: [f.source.id] },
    delegation: empty,
    expiresAt: null,
  });
  const hidden = await rpc(reader.bearer, "tools/list", {});
  expect(JSON.stringify(hidden.result)).not.toContain('"compor_inspecoes_estrutura"');
  const denied = await rpc(reader.bearer, "tools/call", {
    name: "compor_inspecoes_estrutura",
    arguments: { fonteId: f.source.id, ...f.raw },
  });
  expect(!!denied.error || (denied.result as { isError?: boolean }).isError === true).toBe(true);
});
