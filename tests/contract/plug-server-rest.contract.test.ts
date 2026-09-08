import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const roots = [
  process.env.PLUG_SERVER_ROOT,
  resolve(process.cwd(), "../plug_server"),
  resolve(process.cwd(), "plug_server_contract"),
].filter((value): value is string => Boolean(value));

const contractPath = roots
  .map((root) => join(root, "contracts", "plug-mcp-rest-v1.json"))
  .find((path) => existsSync(path));

const compatibilityPath = roots
  .map((root) => join(root, "contracts", "plug-mcp-rest-v1.compatibility.json"))
  .find((path) => existsSync(path));

const contractDescribe = contractPath && compatibilityPath ? describe : describe.skip;

contractDescribe("plug_server REST contract used by MCP", () => {
  const contract = JSON.parse(readFileSync(contractPath!, "utf8")) as {
    contractVersion?: string;
    paths?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
    guarantees?: {
      agentCommands?: string[];
      requestServerTimings?: boolean;
      sqlExecutionMetadata?: string[];
      errorEnvelope?: string;
    };
    compatibility?: {
      baseline?: string;
      policy?: string;
      responseFields?: Record<string, string[]>;
      requestFields?: Record<string, Record<string, { required?: boolean; types?: string[] }>>;
    };
  };

  const compatibilityBaseline = JSON.parse(readFileSync(compatibilityPath!, "utf8")) as {
    contractVersion?: string;
    responseFields?: Record<string, string[]>;
    requestFields?: Record<string, Record<string, { required?: boolean; types?: string[] }>>;
  };

  it("keeps every REST route used by the adapter", () => {
    expect(contract.contractVersion).toMatch(/^1\.\d+\.\d+$/);
    for (const path of [
      "/client-auth/login",
      "/client-auth/refresh",
      "/client/me/agents",
      "/client/me/agents/{agentId}",
      "/client/me/agents/{agentId}/client-token",
      "/client/me/agent-access-requests",
      "/agents/commands",
    ]) {
      expect(contract.paths?.[path]).not.toBeNull();
      expect(contract.paths?.[path]).toBeDefined();
    }
  });

  it("keeps methods, envelopes and status codes consumed by MCP", () => {
    const paths = contract.paths as Record<
      string,
      Record<string, { requestBody?: unknown; responses?: Record<string, unknown> }>
    >;
    const commands = paths["/agents/commands"]?.post;
    expect(commands?.requestBody).toBeDefined();
    expect(commands?.responses).toEqual(
      expect.objectContaining({
        "200": expect.anything(),
        "202": expect.anything(),
        "400": expect.anything(),
        "401": expect.anything(),
        "403": expect.anything(),
        "404": expect.anything(),
        "503": expect.anything(),
      }),
    );

    const clientToken = paths["/client/me/agents/{agentId}/client-token"];
    expect(clientToken?.get).toBeDefined();
    expect(clientToken?.put?.requestBody).toBeDefined();
    expect(clientToken?.put?.responses).toEqual(
      expect.objectContaining({
        "200": expect.anything(),
        "400": expect.anything(),
        "401": expect.anything(),
        "403": expect.anything(),
      }),
    );
    const schemas = contract.schemas!;
    for (const name of [
      "AgentCommandRequest",
      "AgentCommandResponse200",
      "AgentCommandResponse202",
      "ClientAuthResponse",
      "ErrorResponse",
      "RpcSqlExecuteCommand",
      "SqlExecuteParams",
    ]) {
      expect(schemas[name]).toBeDefined();
    }
  });

  it("advertises the RPC and response metadata consumed by the adapter", () => {
    expect(contract.guarantees?.agentCommands).toEqual(
      expect.arrayContaining(["client_token.getPolicy", "sql.execute"]),
    );
    expect(contract.guarantees?.requestServerTimings).toBe(true);
    expect(contract.guarantees?.sqlExecutionMetadata).toEqual(
      expect.arrayContaining(["sql_handling_mode", "max_rows_handling", "effective_max_rows"]),
    );
    expect(contract.guarantees?.errorEnvelope).toContain("success/error");
  });

  it("does not silently remove response fields covered by the compatibility baseline", () => {
    expect(contract.compatibility?.baseline).toBe("plug-mcp-rest-v1.compatibility.json");
    expect(contract.compatibility?.policy).toContain("major version");
    expect(compatibilityBaseline.contractVersion).toBe(contract.contractVersion);

    expect(compatibilityBaseline.responseFields).toEqual(contract.compatibility?.responseFields);
    expect(compatibilityBaseline.requestFields).toEqual(contract.compatibility?.requestFields);
    expect(contract.compatibility?.requestFields?.["POST /agents/commands"]).toEqual(
      expect.objectContaining({ agentId: expect.objectContaining({ required: true }) }),
    );
  });
});
