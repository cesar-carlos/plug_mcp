import { reviewDateFixture } from "../helpers/review-deadline.js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { personaV2TestDatabaseUrl } from "../../src/config/persona-v2-test.js";
import { applyPersonaMigrations } from "../../src/infrastructure/persistence/persona-v2/migrate.js";
import { PostgresPersonaRepository } from "../../src/infrastructure/persistence/persona-v2/repository.js";
import { PostgresSharedKnowledgeRepository } from "../../src/infrastructure/persistence/persona-v2/shared-knowledge.js";
import { MemoryAdministrativeSessions } from "../../src/infrastructure/persistence/persona-v2/admin-sessions.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PersonaAdministration } from "../../src/application/persona-v2/administration.js";
import { PersonaAdministrativeAuthorization } from "../../src/application/persona-v2/administrative-authorization.js";
import { PersonaOwnerDelegation } from "../../src/application/persona-v2/owner-delegation.js";
import { PersonaConsumerCatalog } from "../../src/application/persona-v2/consumer-catalog.js";
import { PersonaPhysicalProfiles } from "../../src/application/persona-v2/physical-profiles.js";
import { PersonaPhysicalCuration } from "../../src/application/persona-v2/physical-curation.js";
import { PersonaKnowledgeMaintenance } from "../../src/application/persona-v2/knowledge-maintenance.js";
import { PersonaReviewWorker } from "../../src/application/persona-v2/review-worker.js";
import { PostgresReviewWorker } from "../../src/infrastructure/persistence/persona-v2/review-worker.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PhysicalKnowledgeAuthority } from "../../src/application/persona-v2/physical-knowledge-authority.js";
import { SharedKnowledge } from "../../src/application/persona-v2/shared-knowledge.js";
import { canonicalJson } from "../../src/domain/persona-v2/catalog.js";
import type { PhysicalProfilePublication } from "../../src/domain/persona-v2/physical-profile.js";
import type { PhysicalCurationScope } from "../../src/application/persona-v2/physical-curation.js";
import { sourceSchemaResultSchema } from "../../src/domain/persona-v2/source-schema.js";
import { structureContent } from "../helpers/persona-v2-structure.js";
import { sourceProof } from "../helpers/persona-v2-training.js";
const baseUrl = new URL(personaV2TestDatabaseUrl()),
  adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const name = `physical_curation_${randomUUID().replaceAll("-", "")}_test`;
baseUrl.pathname = `/${name}`;
const db = new pg.Pool({ connectionString: baseUrl.toString() }),
  control = new pg.Pool({ connectionString: adminUrl.toString() });
const crypto = new NodeCryptoAdapter("ab".repeat(32)),
  repository = new PostgresPersonaRepository(db, crypto);
let now = new Date(),
  remoteAllowed = true,
  session: string,
  sourceIdentity = "f".repeat(64);
const services = {
  repository,
  crypto,
  sessions: new MemoryAdministrativeSessions(crypto),
  now: () => now,
  ownerAuth: {
    hubOrigin: "https://hub.fixture.test",
    login: async (email: string) => ({ accessToken: email }),
    profile: async (token: string) => ({ clientId: token.split("@")[0]!, active: true }),
  },
  sourceVerifier: {
    verify: async () => ({
      database: "fixture",
      dialect: "postgres" as const,
      identityHash: sourceIdentity,
      verifiedAt: now.toISOString(),
    }),
  },
};
const admin = new PersonaAdministration(services);
const delegation = new PersonaOwnerDelegation(
  services,
  admin,
  {
    create: async () => {
      throw new Error("unused");
    },
    verify: async () => {
      throw new Error("unused");
    },
    revoke: async () => {
      throw new Error("unused");
    },
  },
  "https://mcp.fixture.test",
);
const authority = new PersonaAdministrativeAuthorization(services, admin, delegation);
const gateway = {
  authorize: async () => {
    if (!remoteAllowed) throw new Error("remote access revoked");
    return {
      revalidate: async () => {
        if (!remoteAllowed) throw new Error("remote access revoked");
      },
      execute: async () => {
        throw new Error("No business SQL in this authority fixture");
      },
    };
  },
};
const profiles = new PersonaPhysicalProfiles(services, authority, gateway),
  curation = new PersonaPhysicalCuration(
    services,
    new PhysicalKnowledgeAuthority(services, authority, gateway),
    new PersonaConsumerCatalog(services),
  );
const shared = new SharedKnowledge(services, admin, new PostgresSharedKnowledgeRepository(db));
const knowledgeMaintenance = new PersonaKnowledgeMaintenance(
  services,
  new PersonaConsumerCatalog(services),
  authority,
  new PhysicalKnowledgeAuthority(services, authority, gateway),
  shared,
);
const fixture = async () => {
  const persona = await admin.createPersona(session, {
    name: "Curadoria",
    specialty: "Fixture",
    instructions: "Não inventar",
  });
  const source = await admin.addSource(session, {
    personaId: persona.id,
    name: "Base",
    purpose: "Fixture",
    environment: "test",
    agentId: randomUUID(),
    dialect: "postgres",
    email: "source@fixture.test",
    password: "fixture-password",
    clientToken: "fixture-token",
  });
  const catalog = await shared.create(session, { name: "Catálogo privado" });
  const content = {
    ...structureContent(),
    tables: structureContent().tables.map((t) => ({
      ...t,
      columns: t.columns.map((c) => ({
        ...c,
        nativeTypes: [
          {
            dialect: "postgres" as const,
            type: c.name === "id" ? "int4" : "numeric",
            ...(c.name === "amount" ? { precision: 18, scale: 2 } : {}),
          },
        ],
      })),
    })),
  };
  const pattern = await shared.createPattern(session, catalog.id, {
    slug: "fixture",
    name: "Padrão",
    content,
  });
  const preview = await shared.preview(session, catalog.id, pattern.id, reviewDateFixture());
  const base = await shared.publish(session, catalog.id, pattern.id, {
    confirmationHash: preview.confirmationHash,
  });
  const profile = await profiles.save(session, persona.id, source.id, {
    catalogId: catalog.id,
    basePublicationId: base.id,
    name: "Perfil",
    content,
    overrides: { tables: [], relationships: [] },
  });
  const evidenceId = randomUUID();
  const evidence = sourceSchemaResultSchema.parse({
    contractVersion: 1,
    identity: sourceProof(source),
    observedAt: now.toISOString(),
    resources: [
      {
        resource: { schema: null, name: "orders", type: "table" },
        status: "available",
        columns: [
          { name: "id", nativeType: "int4", ordinal: 1, nullable: false, size: null, scale: null },
          {
            name: "amount",
            nativeType: "numeric",
            ordinal: 2,
            nullable: false,
            size: 18,
            scale: 2,
          },
        ],
        primaryKeys: [],
        uniqueKeys: [],
        foreignKeys: [],
        coverage: {
          columns: true,
          primaryKeys: false,
          uniqueKeys: false,
          foreignKeys: false,
          constraintStatus: false,
        },
        limitations: [],
      },
    ],
    metadataPage: { offset: 0, pageSize: 1, nextOffset: null },
  });
  await repository.transaction({ personaIds: [persona.id], tokenIds: [] }, (tx) =>
    tx.recordStructureEvidence({
      id: evidenceId,
      source,
      scope: {
        resources: [{ schema: null, name: "orders", type: "table" }],
        offset: 0,
        pageSize: 1,
      },
      evidence,
      hash: crypto.sha256Hex(canonicalJson(evidence)),
      expiresAt: new Date(now.getTime() + 900000),
    }),
  );
  const reviewInput = {
    catalogId: catalog.id,
    profileId: profile.id,
    evidenceId,
    reviewDueAt: reviewDateFixture(),
  };
  const review = await profiles.review(session, persona.id, source.id, reviewInput, false);
  if (!("confirmationHash" in review)) throw new Error("Missing preview");
  const pub = (await profiles.review(
    session,
    persona.id,
    source.id,
    { ...reviewInput, confirmationHash: review.confirmationHash },
    true,
  )) as PhysicalProfilePublication;
  const scope: PhysicalCurationScope = {
    personaId: persona.id,
    sourceId: source.id,
    catalogId: catalog.id,
    profilePublicationId: pub.publicationId,
  };
  const input = {
    profilePublicationId: pub.publicationId,
    summary: "Revisão física explícita",
    change: { kind: "regra", value: "Calendário particular sintético" },
  };
  return { persona, source, catalog, profile, pub, scope, input, content, reviewInput };
};
it("maps only the exact physical profile and refuses another source or remote revocation", async () => {
  const f = await fixture();
  const input = { catalogId: f.catalog.id, publicationId: f.pub.publicationId };
  const ids: string[] = [];
  for (const exact of [true, false]) {
    const skillId = randomUUID(),
      publicationId = randomUUID();
    const content = {
      name: exact ? "Perfil adotado" : "Só padrão",
      sharedKnowledge: {
        catalogId: f.catalog.id,
        publicationId: f.pub.basePublicationId,
        ...(exact ? { profilePublicationId: f.pub.publicationId } : {}),
        expectedStructure: {
          version: 1,
          resources: [
            {
              resource: { schema: null, name: "orders", type: "table" },
              columns: [{ name: "id" }],
            },
          ],
        },
      },
    };
    await db.query(
      "INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,rascunho) VALUES($1,$2,$3,'consulta','Rascunho','{}')",
      [skillId, f.persona.id, `fixture-${exact}`],
    );
    await db.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,1,$4,$5)",
      [publicationId, f.persona.id, skillId, content, crypto.sha256Hex(canonicalJson(content))],
    );
    await db.query(
      "INSERT INTO publicacao_fonte(persona_id,publicacao_id,fonte_id,fonte_version) VALUES($1,$2,$3,$4)",
      [f.persona.id, publicationId, f.source.id, f.source.authorizationVersion],
    );
    ids.push(publicationId);
  }
  const impact = await profiles.impact(session, f.persona.id, f.source.id, input);
  expect(impact.publications).toEqual([
    expect.objectContaining({
      publicationId: ids[0],
      name: "Perfil adotado",
      direct: true,
      sources: [{ id: f.source.id, name: f.source.name }],
    }),
  ]);
  expect(impact.nextCursor).toBeNull();
  expect(
    (
      await profiles.impact(session, f.persona.id, f.source.id, {
        ...input,
        table: "orders",
        column: "id",
      })
    ).publications,
  ).toHaveLength(1);
  expect(
    (
      await profiles.impact(session, f.persona.id, f.source.id, {
        ...input,
        table: "orders",
        column: "amount",
      })
    ).publications,
  ).toHaveLength(0);
  expect(
    (
      await profiles.impact(session, f.persona.id, f.source.id, {
        ...input,
        table: "public.orders",
        column: "id",
      })
    ).publications,
  ).toHaveLength(0);
  await expect(
    profiles.impact(session, f.persona.id, f.source.id, { ...input, publicationId: randomUUID() }),
  ).rejects.toThrow();
  await expect(profiles.impact(session, f.persona.id, randomUUID(), input)).rejects.toThrow();
  sourceIdentity = "e".repeat(64);
  const other = await fixture();
  await expect(
    profiles.impact(session, f.persona.id, f.source.id, {
      catalogId: other.catalog.id,
      publicationId: other.pub.publicationId,
    }),
  ).rejects.toThrow("Perfil indisponível para esta base.");
  remoteAllowed = false;
  await expect(profiles.impact(session, f.persona.id, f.source.id, input)).rejects.toThrow();
});
it("compares immutable physical versions and refuses remote revocation or unavailable versions", async () => {
  const f = await fixture();
  await profiles.save(session, f.persona.id, f.source.id, {
    catalogId: f.catalog.id,
    basePublicationId: f.pub.basePublicationId,
    id: f.profile.id,
    expectedRevision: 1,
    name: "Perfil revisão dois",
    content: { ...f.content, rules: [...f.content.rules, "Regra revisada de fixture"] },
    overrides: f.profile.overrides,
  });
  const preview = await profiles.review(session, f.persona.id, f.source.id, f.reviewInput, false);
  if (!("confirmationHash" in preview)) throw new Error("Missing preview");
  const second = (await profiles.review(
    session,
    f.persona.id,
    f.source.id,
    { ...f.reviewInput, confirmationHash: preview.confirmationHash },
    true,
  )) as PhysicalProfilePublication;
  const input = {
    catalogId: f.catalog.id,
    beforeId: f.pub.publicationId,
    afterId: second.publicationId,
  };
  const diff = await profiles.compare(session, f.persona.id, f.source.id, input);
  expect(diff.before.revision).toBe(1);
  expect(diff.after.revision).toBe(2);
  expect(diff.sections.flatMap((s) => s.changes)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "name",
        before: f.profile.name,
        after: "Perfil revisão dois",
      }),
      expect.objectContaining({ path: "content/rules", kind: "changed" }),
    ]),
  );
  expect(
    (
      await profiles.compare(session, f.persona.id, f.source.id, {
        ...input,
        afterId: input.beforeId,
      })
    ).sections,
  ).toEqual([]);
  await expect(
    profiles.compare(session, f.persona.id, f.source.id, { ...input, afterId: randomUUID() }),
  ).rejects.toThrow();
  remoteAllowed = false;
  await expect(profiles.compare(session, f.persona.id, f.source.id, input)).rejects.toThrow();
});
beforeAll(async () => {
  await control.query(`CREATE DATABASE "${name}"`);
  await applyPersonaMigrations(baseUrl.toString());
});
beforeEach(async () => {
  now = new Date();
  remoteAllowed = true;
  sourceIdentity = "f".repeat(64);
  session = (await admin.login("owner@fixture.test", "fixture-password")).sessionId;
});
afterAll(async () => {
  await db.end();
  await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await control.end();
});
it("colaborador vê somente sua autoria, não revisa e perde acesso após revogação do papel", async () => {
  const f = await fixture();
  await curation.propose(session, f.scope, f.input);
  await shared.setMember(session, f.catalog.id, {
    expectedVersion: 1,
    hubClientId: "collaborator",
    role: "contributor",
  });
  const collaborator = (await admin.login("collaborator@fixture.test", "fixture-password"))
    .sessionId;
  const persona = await admin.createPersona(collaborator, {
    name: "Colaborador",
    specialty: "Fixture",
    instructions: "Sem autoridade herdada",
  });
  const source = await admin.addSource(collaborator, {
    personaId: persona.id,
    name: "Mesma base",
    purpose: "Fixture",
    environment: "test",
    agentId: f.source.agentId,
    dialect: "postgres",
    email: "source@fixture.test",
    password: "fixture-password",
    clientToken: "fixture-token",
  });
  const scope = { ...f.scope, personaId: persona.id, sourceId: source.id };
  const proposal = await curation.propose(collaborator, scope, {
    ...f.input,
    summary: "Proposta própria",
  });
  const own = await curation.list(collaborator, scope, {});
  expect(own.mayReview).toBe(false);
  expect(own.proposals.map((p) => p.id)).toEqual([proposal.id]);
  await expect(
    curation.review(collaborator, scope, proposal.id, {}, "preview"),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const preview = (await curation.review(session, f.scope, proposal.id, {}, "preview")) as {
    confirmationHash: string;
  };
  await shared.setMember(session, f.catalog.id, {
    expectedVersion: 2,
    hubClientId: "collaborator",
    role: "reader",
  });
  await expect(curation.propose(collaborator, scope, f.input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(curation.list(collaborator, scope, {})).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(
    curation.review(
      session,
      f.scope,
      proposal.id,
      { confirmationHash: preview.confirmationHash, reason: "Autoridade alterada" },
      "incorporar",
    ),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
});
it("incorpora somente ao rascunho com preview exato e CAS, preservando publicação e proveniência", async () => {
  const f = await fixture(),
    proposal = await curation.propose(session, f.scope, f.input);
  const before = await db.query(
    "SELECT payload,hash FROM physical_knowledge_proposal_v2 WHERE id=$1",
    [proposal.id],
  );
  const p = (await curation.review(session, f.scope, proposal.id, {}, "preview")) as {
    confirmationHash: string;
  };
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      curation.review(
        session,
        f.scope,
        proposal.id,
        { confirmationHash: p.confirmationHash, reason: "Revisão explícita" },
        "incorporar",
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const draft = await repository.transaction({ personaIds: [f.persona.id], tokenIds: [] }, (tx) =>
    tx.profiles!.get(f.catalog.id, f.profile.id),
  );
  expect(draft?.revision).toBe(2);
  expect(draft?.content.rules).toContain(f.input.change.value);
  expect(
    (
      await profiles.list(session, f.persona.id, f.source.id, {
        catalogId: f.catalog.id,
        basePublicationId: f.pub.basePublicationId,
      })
    ).publications[0]!.content,
  ).toEqual(f.pub.content);
  const after = await db.query(
    "SELECT payload,hash FROM physical_knowledge_proposal_v2 WHERE id=$1",
    [proposal.id],
  );
  expect(after.rows).toEqual(before.rows);
  await expect(
    db.query(
      'UPDATE physical_knowledge_proposal_v2 SET payload=payload || \'{"summary":"changed"}\'::jsonb WHERE id=$1',
      [proposal.id],
    ),
  ).rejects.toThrow("immutable");
  const audit = await db.query("SELECT * FROM knowledge_audit_v2 WHERE catalogo_id=$1", [
    f.catalog.id,
  ]);
  expect(JSON.stringify(audit.rows)).not.toContain(f.input.change.value);
});
it("preview expira, mudança de revisão invalida e conflito de item exige nova proposta", async () => {
  const f = await fixture(),
    proposal = await curation.propose(session, f.scope, f.input);
  const p = (await curation.review(session, f.scope, proposal.id, {}, "preview")) as {
    confirmationHash: string;
  };
  now = new Date(now.getTime() + 900001);
  session = (await admin.login("owner@fixture.test", "fixture-password")).sessionId;
  await expect(
    curation.review(
      session,
      f.scope,
      proposal.id,
      { confirmationHash: p.confirmationHash, reason: "Expirada" },
      "incorporar",
    ),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  const fresh = (await curation.review(session, f.scope, proposal.id, {}, "preview")) as {
    confirmationHash: string;
  };
  await profiles.save(session, f.persona.id, f.source.id, {
    catalogId: f.catalog.id,
    basePublicationId: f.pub.basePublicationId,
    id: f.profile.id,
    expectedRevision: 1,
    name: "Perfil alterado",
    content: f.content,
    overrides: f.profile.overrides,
  });
  await expect(
    curation.review(
      session,
      f.scope,
      proposal.id,
      { confirmationHash: fresh.confirmationHash, reason: "Obsoleta" },
      "incorporar",
    ),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  const changed = await profiles.save(session, f.persona.id, f.source.id, {
    catalogId: f.catalog.id,
    basePublicationId: f.pub.basePublicationId,
    id: f.profile.id,
    expectedRevision: 2,
    name: "Conflito",
    content: { ...f.content, rules: [...f.content.rules, f.input.change.value] },
    overrides: f.profile.overrides,
  });
  expect(changed.revision).toBe(3);
  await expect(curation.review(session, f.scope, proposal.id, {}, "preview")).rejects.toMatchObject(
    { code: "OPERATION_CONFLICT" },
  );
  await curation.review(
    session,
    f.scope,
    proposal.id,
    { expectedVersion: 1, reason: "Conflito resolvido por nova proposta" },
    "rejeitar",
  );
});
it("outra base, falta de acesso remoto e suspensão bloqueiam curadoria", async () => {
  const f = await fixture(),
    proposal = await curation.propose(session, f.scope, f.input);
  sourceIdentity = "d".repeat(64);
  const other = await admin.addSource(session, {
    personaId: f.persona.id,
    name: "Outra",
    purpose: "Fixture",
    environment: "test",
    agentId: randomUUID(),
    dialect: "postgres",
    email: "source@fixture.test",
    password: "fixture-password",
    clientToken: "fixture-token",
  });
  sourceIdentity = "f".repeat(64);
  await expect(
    curation.list(session, { ...f.scope, sourceId: other.id }, {}),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  remoteAllowed = false;
  await expect(curation.review(session, f.scope, proposal.id, {}, "preview")).rejects.toThrow(
    "remote access revoked",
  );
  remoteAllowed = true;
  await profiles.suspend(session, f.persona.id, f.source.id, {
    catalogId: f.catalog.id,
    publicationId: f.pub.publicationId,
  });
  await expect(curation.review(session, f.scope, proposal.id, {}, "preview")).rejects.toMatchObject(
    { code: "AUTHORIZATION_DENIED" },
  );
});
it("revisão temporal do perfil exige curador e prova vigente, vencimento apenas sinaliza tarefa", async () => {
  const f = await fixture();
  const empty = await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
  );
  expect(empty).toMatchObject({ state: "em_dia", dueAt: f.reviewInput.reviewDueAt, version: 1 });
  const raw = {
    expectedVersion: 1,
    dueAt: new Date(now.getTime() + 60000).toISOString(),
    decision: "configurar",
    reason: "Prazo específico do curador",
  };
  await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
    raw,
  );
  now = new Date(now.getTime() + 61000);
  const due = await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
  );
  expect(due).toMatchObject({
    state: "vencida",
    blocksExecution: false,
    task: "Revisar conhecimento publicado",
  });
  expect(
    (
      await repository.transaction({ personaIds: [f.persona.id], tokenIds: [] }, (tx) =>
        tx.profiles!.publication(f.catalog.id, f.pub.publicationId),
      )
    )?.hash,
  ).toBe(f.pub.hash);
  remoteAllowed = false;
  await expect(
    knowledgeMaintenance.physicalReview(
      session,
      f.persona.id,
      f.source.id,
      f.catalog.id,
      f.pub.publicationId,
      { ...raw, expectedVersion: 2, dueAt: new Date(now.getTime() + 60000).toISOString() },
    ),
  ).rejects.toThrow("remote access revoked");
});
it("calendário do padrão mantém snapshot e não permite colaborador configurar ou revisar", async () => {
  const f = await fixture();
  const raw = {
    expectedVersion: 1,
    dueAt: new Date(now.getTime() + 60000).toISOString(),
    decision: "configurar",
    reason: "Padrão revisável",
  };
  await knowledgeMaintenance.standardReview(session, f.catalog.id, f.pub.basePublicationId, raw);
  await shared.setMember(session, f.catalog.id, {
    expectedVersion: 1,
    hubClientId: "collaborator",
    role: "contributor",
  });
  const collaborator = (await admin.login("collaborator@fixture.test", "fixture-password"))
    .sessionId;
  await expect(
    knowledgeMaintenance.standardReview(collaborator, f.catalog.id, f.pub.basePublicationId),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    knowledgeMaintenance.standardReview(collaborator, f.catalog.id, f.pub.basePublicationId, {
      ...raw,
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect((await shared.publication(session, f.catalog.id, f.pub.basePublicationId)).hash).toBe(
    f.pub.baseHash,
  );
});
it("exige substituição explícita e exemplos novos permanecem candidatos", async () => {
  const f = await fixture(),
    change = {
      kind: "tabela",
      value: { ...f.content.tables[0]!, meaning: "Significado particular" },
    };
  await expect(curation.propose(session, f.scope, { ...f.input, change })).rejects.toMatchObject({
    code: "INVALID_PLAN",
  });
  const p = await curation.propose(session, f.scope, { ...f.input, change, overrideCommon: true });
  expect(p.overrideCommon).toBe(true);
  const example = { ...f.content.examples[0]!, id: "new-example", state: "approved" };
  const candidate = await curation.propose(session, f.scope, {
    ...f.input,
    change: { kind: "exemplo_sql", value: example },
  });
  expect(candidate.change.kind === "exemplo_sql" && candidate.change.value.state).toBe("candidate");
  const preview = (await curation.review(session, f.scope, candidate.id, {}, "preview")) as {
    confirmationHash: string;
  };
  await curation.review(
    session,
    f.scope,
    candidate.id,
    { confirmationHash: preview.confirmationHash, reason: "Apenas candidato" },
    "incorporar",
  );
  await expect(
    profiles.review(session, f.persona.id, f.source.id, f.reviewInput, false),
  ).rejects.toMatchObject({ code: "INCOMPLETE_INPUT" });
  const altered = { ...p, physicalSourceId: randomUUID(), id: randomUUID() };
  await expect(
    repository.transaction({ personaIds: [f.persona.id], tokenIds: [] }, (tx) =>
      tx.physicalCuration!.create(altered),
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
it("publicação exige prazo humano, vincula mudanças à prévia e não fabrica calendário antigo", async () => {
  const f = await fixture();
  const pattern = await shared.createPattern(session, f.catalog.id, {
    slug: "review-required",
    name: "Prazo obrigatório",
    content: f.content,
  });
  await expect(shared.preview(session, f.catalog.id, pattern.id)).rejects.toMatchObject({
    code: "INCOMPLETE_INPUT",
  });
  await expect(
    shared.preview(session, f.catalog.id, pattern.id, new Date(now.getTime() - 1).toISOString()),
  ).rejects.toMatchObject({ code: "INVALID_PLAN" });
  const first = await shared.preview(
    session,
    f.catalog.id,
    pattern.id,
    new Date(now.getTime() + 60000).toISOString(),
  );
  const second = await shared.preview(
    session,
    f.catalog.id,
    pattern.id,
    new Date(now.getTime() + 120000).toISOString(),
  );
  await expect(
    shared.publish(session, f.catalog.id, pattern.id, { confirmationHash: first.confirmationHash }),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  const pub = await shared.publish(session, f.catalog.id, pattern.id, {
    confirmationHash: second.confirmationHash,
  });
  const calendar = await knowledgeMaintenance.standardReview(session, f.catalog.id, pub.id);
  expect(calendar).toMatchObject({ version: 1, dueAt: second.reviewDueAt, state: "em_dia" });
  const oldPub = { ...pub, id: randomUUID() };
  // Import-free upgrade fixture: store an old v2 publication through its repository contract,
  // without invoking the new application's publication/calendar path.
  const historical = await shared.createPattern(session, f.catalog.id, {
    slug: "historical",
    name: "Versão v2 histórica",
    content: f.content,
  });
  const owner = services.sessions.find(session, now)!.owner.id;
  await repository.transaction({ personaIds: [f.persona.id], tokenIds: [] }, async (tx) => {
    await tx.knowledge!.savePreview({
      hash: "e".repeat(64),
      catalogId: f.catalog.id,
      patternId: historical.id,
      ownerId: owner,
      revision: 1,
      catalogVersion: 1,
      packageHash: pub.hash,
      previousPublicationId: null,
      expiresAt: new Date(now.getTime() + 60000),
    });
    await tx.knowledge!.publish({ ...oldPub, patternId: historical.id }, "e".repeat(64), now);
  });
  expect(await knowledgeMaintenance.standardReview(session, f.catalog.id, oldPub.id)).toMatchObject(
    { state: "nao_configurada", dueAt: null, version: 0 },
  );
  const expiring = await shared.createPattern(session, f.catalog.id, {
    slug: "expiring-review",
    name: "Prazo vence antes da confirmação",
    content: f.content,
  });
  const expiringPreview = await shared.preview(
    session,
    f.catalog.id,
    expiring.id,
    new Date(now.getTime() + 1000).toISOString(),
  );
  now = new Date(now.getTime() + 1500);
  await expect(
    shared.publish(session, f.catalog.id, expiring.id, {
      confirmationHash: expiringPreview.confirmationHash,
    }),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  const afterExpiry = await shared.listPatterns(session, f.catalog.id);
  expect(
    "patterns" in afterExpiry &&
      afterExpiry.patterns.find((v) => v.id === expiring.id)?.activePublicationId,
  ).toBeNull();
});
it("dois workers criam uma tarefa/notificação por calendário, leitura não conclui revisão e novo prazo encerra tarefa", async () => {
  const f = await fixture();
  await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
    {
      expectedVersion: 1,
      dueAt: new Date(now.getTime() + 1000).toISOString(),
      decision: "configurar",
      reason: "Vencimento sintético explícito",
    },
  );
  const dueAt = now.getTime() + 1000;
  // The calendar deliberately starts in the future. Wait on the database clock
  // before asserting expiry; the poll's default budget is itself only 1 second.
  // Bound the wait so clock divergence still fails instead of extending the test.
  await db.query(
    "SELECT pg_sleep(GREATEST(0, LEAST(1, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp())))))",
    [new Date(dueAt)],
  );
  await expect
    .poll(
      async () =>
        (await db.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]!.now.getTime() >=
        dueAt,
    )
    .toBe(true);
  now = new Date();
  const port = new PostgresReviewWorker(db),
    a = new PersonaReviewWorker(port, randomUUID(), () => now),
    b = new PersonaReviewWorker(port, randomUUID(), () => now);
  const results = await Promise.all([a.runOnce(), b.runOnce()]);
  expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(1);
  const view = await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
  );
  expect(view.notifications.items).toHaveLength(1);
  const task = view.notifications.items[0]!;
  await expect(
    knowledgeMaintenance.standardReview(
      session,
      f.catalog.id,
      f.pub.basePublicationId,
      undefined,
      undefined,
      task.id,
    ),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  remoteAllowed = false;
  await expect(
    knowledgeMaintenance.physicalReview(
      session,
      f.persona.id,
      f.source.id,
      f.catalog.id,
      f.pub.publicationId,
      undefined,
      undefined,
      task.id,
    ),
  ).rejects.toThrow();
  remoteAllowed = true;
  const read = await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
    undefined,
    undefined,
    task.id,
  );
  expect(read.notifications.items[0]!.readAt).not.toBeNull();
  expect(read.state).toBe("vencida");
  expect(read.version).toBe(2);
  await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
    {
      expectedVersion: 2,
      dueAt: new Date(now.getTime() + 60000).toISOString(),
      decision: "revisado",
      reason: "Revisão humana realizada",
    },
  );
  expect((await b.runOnce()).closed).toBe(1);
  expect((await a.runOnce()).created).toBe(0);
  expect(
    (
      await profiles.list(session, f.persona.id, f.source.id, {
        catalogId: f.catalog.id,
        basePublicationId: f.pub.basePublicationId,
      })
    ).publications[0]!.hash,
  ).toBe(f.pub.hash);
});
it("lease abandonado expira, processo do worker reinicia sem duplicar notificação", async () => {
  const f = await fixture();
  await knowledgeMaintenance.physicalReview(
    session,
    f.persona.id,
    f.source.id,
    f.catalog.id,
    f.pub.publicationId,
    {
      expectedVersion: 1,
      dueAt: new Date(Date.now() + 300).toISOString(),
      decision: "configurar",
      reason: "Reinício de fixture",
    },
  );
  const port = new PostgresReviewWorker(db),
    dead = randomUUID();
  await port.claim(dead, new Date(), new Date(Date.now() + 200));
  const early = await new PersonaReviewWorker(port, randomUUID(), () => new Date()).runOnce();
  expect(early.claimed).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const start = () =>
    spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/worker-persona-v2.ts"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: "test",
        DATABASE_URL: baseUrl.toString(),
        MCP_ENCRYPTION_KEY: "a".repeat(64),
        PLUG_SERVER_BASE_URL: "https://hub.fixture.test",
        LOG_LEVEL: "silent",
        PERSONA_V2_REVIEW_WORKER_INTERVAL_MS: "1000",
      },
      stdio: "ignore",
    });
  for (let i = 0; i < 2; i++) {
    const child = start();
    try {
      await expect
        .poll(
          async () =>
            Number(
              (
                await db.query(
                  "SELECT count(*) n FROM knowledge_review_notification_v2 n JOIN knowledge_review_task_v2 t ON t.id=n.task_id WHERE t.publication_id=$1",
                  [f.pub.publicationId],
                )
              ).rows[0].n,
            ),
          { timeout: 10000 },
        )
        .toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    }
  }
  expect(
    Number(
      (
        await db.query("SELECT count(*) n FROM knowledge_review_task_v2 WHERE publication_id=$1", [
          f.pub.publicationId,
        ])
      ).rows[0].n,
    ),
  ).toBe(1);
});
