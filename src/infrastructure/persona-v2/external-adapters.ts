import { externalHeaders, externalRpcResult, listExternalTools } from "./external-protocol.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { integrationRegistrationSchema } from "../../domain/persona-v2/integration-credential.js";
import {
  externalContractSchema,
  validateExternalValues,
  type ExternalConnection,
  type ExternalContract,
  type ExternalTransport,
  type ExternalActionTransport,
} from "../../domain/persona-v2/external-contract.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { PublicExternalHttp } from "./external-http.js";
const denied = () =>
  new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Contrato externo mudou ou resposta inválida.");
/** Only explicit contracts are callable; returned descriptions never become instructions. */
export class PersonaExternalAdapters implements ExternalTransport, ExternalActionTransport {
  constructor(private readonly http = new PublicExternalHttp()) {}
  async invoke(
    connection: ExternalConnection,
    raw: ExternalContract,
    rawInput: Record<string, string | number | boolean>,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
  ): Promise<unknown> {
    if (raw.effect !== "consulta")
      throw new PersonaV2Error("APPROVAL_REQUIRED", "Use preparação durável para ações externas.");
    return this.perform(connection, raw, rawInput, signal, beforeDispatch);
  }
  async executeAction(
    connection: ExternalConnection,
    raw: ExternalContract,
    input: Record<string, string | number | boolean>,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
    beforeEffect: () => Promise<void>,
  ): Promise<unknown> {
    if (raw.effect !== "acao") throw denied();
    return this.perform(connection, raw, input, signal, beforeDispatch, beforeEffect);
  }
  private async perform(
    connection: ExternalConnection,
    raw: ExternalContract,
    rawInput: Record<string, string | number | boolean>,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
    beforeEffect?: () => Promise<void>,
  ): Promise<unknown> {
    const contract = externalContractSchema.parse(raw),
      input = validateExternalValues(contract.input, rawInput);
    integrationRegistrationSchema.parse({
      name: "transport",
      kind: contract.transport.kind,
      destination: connection.destination,
    });
    const own = externalHeaders(connection),
      base = new URL(connection.destination);
    try {
      if (contract.transport.kind === "rest") {
        const url = new URL(base);
        url.pathname = base.pathname.replace(/\/$/, "") + contract.transport.path;
        const write = contract.effect === "acao";
        if (!write) for (const [k, v] of Object.entries(input)) url.searchParams.set(k, String(v));
        const response = await this.http.send(
          {
            url,
            method: contract.transport.method,
            headers: {
              ...own,
              Accept: "application/json",
              "Accept-Encoding": "identity",
              ...(write ? { "Content-Type": "application/json" } : {}),
            },
            ...(write ? { body: JSON.stringify(input) } : {}),
            signal,
            maxBytes: contract.maxResponseBytes,
          },
          async () => {
            await beforeDispatch();
            if (write) {
              if (!beforeEffect) throw denied();
              await beforeEffect();
            }
          },
        );
        if (response.status === 204 && Object.keys(contract.output).length === 0 && !response.body)
          return validateExternalValues(contract.output, {});
        if (
          !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(
            response.headers["content-type"] ?? "",
          )
        )
          throw denied();
        return validateExternalValues(contract.output, JSON.parse(response.body));
      }
      let session: string | undefined,
        protocol = "2025-11-25";
      const send = async (
        method: string,
        params: unknown,
        notification = false,
      ): Promise<unknown> => {
        const id = randomUUID(),
          body = JSON.stringify({
            jsonrpc: "2.0",
            ...(notification ? {} : { id }),
            method,
            params,
          });
        const response = await this.http.send(
          {
            url: base,
            method: "POST",
            headers: {
              ...own,
              Accept: "application/json, text/event-stream",
              "Content-Type": "application/json",
              "Accept-Encoding": "identity",
              ...(method !== "initialize" ? { "MCP-Protocol-Version": protocol } : {}),
              ...(session ? { "Mcp-Session-Id": session } : {}),
            },
            body,
            signal,
            maxBytes: contract.maxResponseBytes,
          },
          async () => {
            await beforeDispatch();
            if (method === "tools/call" && contract.effect === "acao") {
              if (!beforeEffect) throw denied();
              await beforeEffect();
            }
          },
        );
        const offered = response.headers["mcp-session-id"];
        if (offered) {
          if (!/^[\x21-\x7e]{1,256}$/.test(offered) || (session && session !== offered))
            throw denied();
          session = offered;
        }
        if (notification) {
          if (response.status !== 202 && response.status !== 204) throw denied();
          return null;
        }
        return externalRpcResult(response, id);
      };
      const initialized = z
        .object({
          protocolVersion: z.enum(["2025-03-26", "2025-06-18", "2025-11-25"]),
          capabilities: z.object({ tools: z.object({}).passthrough() }),
        })
        .parse(
          await send("initialize", {
            protocolVersion: protocol,
            capabilities: {},
            clientInfo: { name: "se7e-persona-v2", version: "1" },
          }),
        );
      protocol = initialized.protocolVersion;
      await send("notifications/initialized", {}, true);
      const tools = await listExternalTools(send);
      const matching = tools.filter(
        (t) => t.name === (contract.transport.kind === "mcp_http" ? contract.transport.tool : ""),
      );
      const selected = matching[0];
      if (
        matching.length !== 1 ||
        !selected ||
        (contract.effect === "consulta" && selected.annotations?.readOnlyHint !== true) ||
        canonicalJson(selected.inputSchema) !== canonicalJson(contract.transport.inputSchema) ||
        canonicalJson(selected.outputSchema ?? null) !==
          canonicalJson(contract.transport.outputSchema)
      )
        throw denied();
      const result = z
        .object({ isError: z.boolean().optional(), structuredContent: z.unknown() })
        .parse(await send("tools/call", { name: contract.transport.tool, arguments: input }));
      if (result.isError) throw denied();
      return validateExternalValues(contract.output, result.structuredContent);
    } catch (error) {
      if (error instanceof PersonaV2Error) throw error;
      throw denied();
    }
  }
}
