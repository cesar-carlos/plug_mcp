import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  HUB_CONTRACT_HASH,
  HUB_CONTRACT_SNAPSHOT_HASH,
  HUB_CONTRACT_REF,
  HUB_CONTRACT_SNAPSHOT_BASE_REF,
  HUB_CONTRACT_SNAPSHOT_INCORPORATED_REF,
} from "../../src/application/use-cases/shared/treinamento-base.js";
import { OPERATION_FAILURE_CODES } from "../../src/domain/persona-v2/operation.js";

describe("contrato coordenado do hub", () => {
  const bytes = readFileSync("contracts/plug-mcp-rest-v1.json");
  const contract = JSON.parse(bytes.toString("utf8"));
  it.each(["verify", "windows"])(
    "fornece o checkout upstream exato antes do gate no job %s",
    (jobName) => {
      const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
        jobs: Record<
          string,
          {
            env: Record<string, string>;
            steps: { uses?: string; run?: string; with?: Record<string, unknown> }[];
          }
        >;
      };
      const job = workflow.jobs[jobName]!;
      const gate = job.steps.findIndex((step) => step.run === "npm run release:check");
      expect(gate).toBeGreaterThan(-1);
      const upstream = job.steps.findIndex(
        (step) =>
          step.uses?.startsWith("actions/checkout@") &&
          step.with?.repository === "cesar-carlos/plug_server",
      );
      expect(upstream).toBeGreaterThan(-1);
      expect(upstream).toBeLessThan(gate);
      expect(job.steps[upstream]!.with).toMatchObject({
        ref: HUB_CONTRACT_REF,
        path: "plug_server_contract",
        "fetch-depth": 0,
      });
      expect(job.env.PLUG_SERVER_ROOT).toBe("${{ github.workspace }}/plug_server_contract");
    },
  );
  it("fixa os bytes do contrato e o snapshot reproduzível, sem inventar commit upstream", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(HUB_CONTRACT_HASH);
    expect(
      createHash("sha256")
        .update(readFileSync("contracts/hub-persona-v2.snapshot.patch"))
        .digest("hex"),
    ).toBe(HUB_CONTRACT_SNAPSHOT_HASH);
    expect(contract.contractVersion).toBe("1.15.0");
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).toContain(`ref: ${HUB_CONTRACT_REF}`);
    const patch = readFileSync("contracts/hub-persona-v2.snapshot.patch", "utf8");
    expect(patch).toContain("diff --git a/scripts/generate-plug-mcp-contract.ts");
    expect(patch).toContain("diff --git a/src/shared/validators/sql_operation.ts");
    expect(HUB_CONTRACT_REF).not.toBe(HUB_CONTRACT_SNAPSHOT_BASE_REF);
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("npm run training:check");
    expect(HUB_CONTRACT_SNAPSHOT_INCORPORATED_REF).not.toBe(HUB_CONTRACT_SNAPSHOT_BASE_REF);
    expect(readFileSync("scripts/hub-snapshot.ts", "utf8")).toContain('"--cached"');
    expect(workflow).not.toContain(
      'apply "$GITHUB_WORKSPACE/contracts/hub-persona-v2.snapshot.patch"',
    );
  });
  it("fixa motivo durável enumerado opcional, sem mensagens ou autoridade implícita", () => {
    expect(contract.schemas.SqlOperationStatus.properties.failureCode.enum).toEqual(
      OPERATION_FAILURE_CODES,
    );
    expect(contract.schemas.SqlOperationStatus.required).not.toContain("failureCode");
    expect(contract.schemas.SqlOperationStatus.allOf).toBeDefined();
  });
  it("documenta capabilities estruturais opcionais na resposta autenticada efetiva", () => {
    for (const name of ["sourceIdentity", "sourceSchema", "sourceConstraints"]) {
      expect(contract.schemas.ClientAccessibleAgent.properties[name]).toMatchObject({
        type: "integer",
        enum: [1],
        nullable: true,
      });
      expect(contract.schemas.ClientAccessibleAgent.required).not.toContain(name);
      expect(
        contract.compatibility.responseFields["GET /client/me/agents/{agentId} 200"],
      ).toContain(`agent.${name}`);
    }
  });
  it("delegates only active Client identity with an opaque revocable credential", () => {
    expect(contract.guarantees.ownerDelegation).toMatchObject({
      version: 1,
      lifetimeDays: 30,
      storedCredential: "sha256",
      automaticRetry: false,
    });
    const base = "/client-auth/persona-delegations";
    expect(contract.paths[base].post.security).toEqual([{ bearerAuth: [] }]);
    expect(contract.paths[`${base}/verify`].post.security).toEqual([]);
    expect(contract.paths[`${base}/{id}`].delete.security).toEqual([{ bearerAuth: [] }]);
  });
  it("consome perfil Client autenticado somente por leitura", () => {
    expect(contract.paths["/client-auth/me"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(contract.paths["/client-auth/me"].patch).toBeUndefined();
    expect(contract.compatibility.responseFields["GET /client-auth/me 200"]).toContain("client.id");
  });
  it("descoberta física é RPC encaminhado ao agente, sem conexão direta do MCP", () => {
    expect(contract.guarantees.sourceSchema).toMatchObject({
      version: 1,
      metadataOnly: true,
      executingConnectionColumns: true,
      constraintStatusVerified: "per-resource",
      constraintsCapability: "sourceConstraints:1",
      automaticRetry: false,
    });
    expect(contract.schemas.SourceSchemaParams.properties.sql).toBeUndefined();
    expect(contract.schemas.SqlExecuteParams.properties.expectedStructure).toEqual({
      $ref: "#/components/schemas/ExpectedStructure",
    });
    expect(contract.guarantees.agentCommands).toContain("sql.describeSource");
    expect(contract.guarantees.sourceIdentity).toMatchObject({
      version: 1,
      executingConnection: true,
      agentCapabilityRequired: true,
    });
    expect(contract.schemas.SqlExecuteParams.properties.expectedSource).toEqual({
      $ref: "#/components/schemas/ExpectedSource",
    });
    expect(
      contract.schemas.SqlOperationExecuteParams.properties.expectedSource.properties.identityHash
        .pattern,
    ).toBe("^[a-f0-9]{64}$");
    expect(contract.guarantees.sourceDiscovery).toMatchObject({
      contractVersion: 1,
      agentCapabilityRequired: true,
      automaticRetry: false,
    });
    expect(contract.schemas.SourceDiscoveryParams.properties.database).toMatchObject({
      type: "string",
      minLength: 1,
    });
    expect(contract.schemas.SourceDiscoveryParams.properties.sql).toBeUndefined();
  });
  it("transporte de escrita depende de capability exata e não recomenda retry", () => {
    expect(contract.guarantees.sqlOperations).toMatchObject({
      contractVersion: 1,
      available: true,
      agentCapabilityRequired: true,
      automaticRetry: false,
      methods: ["sql.operation.execute", "sql.operation.get", "sql.operation.cancel"],
      structureGuard: {
        version: 1,
        capability: "sqlOperations.structureGuard:1",
        expectedSourceRequired: true,
        executingConnectionBeforeBegin: true,
        includesMetadataInStatementBudget: true,
      },
    });
    expect(contract.schemas.SqlOperationExecuteParams.properties.contractVersion.enum).toEqual([1]);
    expect(contract.schemas.SqlOperationExecuteParams.properties.expectedStructure).toBeDefined();
    expect(
      contract.schemas.ClientAccessibleAgent.properties.sqlOperations.properties.structureGuard,
    ).toMatchObject({ type: "integer", enum: [1] });
  });
});
