import { expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import {
  compileQueryTraining,
  sourceFingerprint,
} from "../../../src/application/persona-v2/query-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import type {
  PersonaServices,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { parseMcpPayload, toolJson } from "../../helpers/mcp-rpc.js";

function fixture() {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const pkg = compileQueryTraining(queryTraining(), trainingSource, crypto);
  const publication = {
    id: "publication",
    skillId: "skill",
    personaId: trainingSource.personaId,
    revision: 1,
    package: pkg,
    hash: crypto.sha256Hex(canonicalJson(pkg)),
    sourceVersion: 1,
    sourceFingerprint: sourceFingerprint(trainingSource, crypto),
    suspendedAt: null,
  };
  const identity = {
    personaId: trainingSource.personaId,
    tokenId: "token",
    tokenVersion: 1,
    personaVersion: 1,
  };
  const state = {
    persona: {
      id: identity.personaId,
      ownerId: "owner",
      active: true,
      authorizationVersion: 1,
      name: "Synthetic persona",
      specialty: "Listing",
      instructions: "Do not add unsolicited subtotals.",
    },
    token: {
      id: "token",
      personaId: identity.personaId,
      authorizationVersion: 1,
      revokedAt: null as Date | null,
      expiresAt: null,
      tokenHash: "PRIVATE_TOKEN_HASH",
      permissions: {
        sourceIds: [trainingSource.id],
        externalOperationIds: [],
        administrative: [],
        skills: [
          {
            skillId: "skill",
            capabilities: pkg.requiredCapabilities,
            effects: ["select"],
            requireHumanApproval: false,
          },
        ],
      },
    },
    sources: [trainingSource],
  };
  let revokeDuringRead = false;
  const tx = {
    authorization: async () => state,
    catalog: {
      list: async () => [
        { id: "skill", slug: "orders", kind: "consulta", activePublicationId: "publication" },
      ],
      publication: async () => {
        if (revokeDuringRead) state.token.revokedAt = new Date();
        return publication;
      },
    },
  } as unknown as PersonaTransaction;
  const services = {
    crypto,
    now: () => new Date("2026-11-17T00:00:00Z"),
    repository: {
      transaction: async (_locks: unknown, action: (tx: PersonaTransaction) => Promise<unknown>) =>
        action(tx),
    },
  } as unknown as PersonaServices;
  return {
    catalog: new PersonaConsumerCatalog(services),
    identity,
    state,
    publication,
    revokeDuringRead: () => {
      revokeDuringRead = true;
    },
  };
}

it("delivers current persona instructions with obter_skill without a separate context call or republication", async () => {
  const f = fixture();
  // Transport authentication is stubbed; catalog authorization and read are real.
  f.catalog.authenticate = async () => f.identity;
  const app = express();
  app.use(express.json());
  app.post("/mcp", createPersonaV2McpHandler(f.catalog, "http://fixture.test"));
  const read = async () =>
    toolJson(
      parseMcpPayload(
        await request(app)
          .post("/mcp")
          .set("Host", "fixture.test")
          .set("Authorization", "Bearer fixture")
          .set("Accept", "application/json, text/event-stream")
          .send({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "obter_skill", arguments: { slug: "orders" } },
          }),
      ),
    );
  const first = await read();
  expect(first.personaContext).toEqual({
    id: f.identity.personaId,
    name: "Synthetic persona",
    specialty: "Listing",
    instructions: "Do not add unsolicited subtotals.",
  });
  f.state.persona.instructions = "Show only the requested columns.";
  const second = await read();
  expect(second.personaContext).toMatchObject({ instructions: "Show only the requested columns." });
  expect(second.hash).toBe(first.hash);
  expect(second.publicationId).toBe(first.publicationId);
  expect(second.sqlModel).toBe(first.sqlModel);
  expect(f.publication.package).not.toHaveProperty("personaContext");
  expect(JSON.stringify(second)).not.toContain("PRIVATE_TOKEN_HASH");
});

it("does not disclose persona context for an inaccessible skill or another persona", async () => {
  const f = fixture();
  f.state.token.permissions.skills = [];
  await expect(f.catalog.read(f.identity, "orders")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  await expect(
    f.catalog.read({ ...f.identity, personaId: "other" }, "orders"),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
});

it("blocks delivery when authorization is revoked during the read", async () => {
  const f = fixture();
  f.revokeDuringRead();
  await expect(f.catalog.read(f.identity, "orders")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
});
