import type { ExternalDiscoveryTransport } from "../../domain/ports/external-discovery.port.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ExternalToolCatalog } from "../../domain/persona-v2/external-import.js";
import type { ExternalConnection } from "../../domain/persona-v2/external-contract.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { integrationRegistrationSchema } from "../../domain/persona-v2/integration-credential.js";
import { PublicExternalHttp } from "./external-http.js";
import { externalHeaders, externalRpcResult, listExternalTools } from "./external-protocol.js";

/** Administrative discovery only: never tools/call, GET/SSE, redirects or retries. */
export class PersonaExternalDiscovery implements ExternalDiscoveryTransport {
  constructor(private readonly http = new PublicExternalHttp()) {}
  async discover(
    connection: ExternalConnection,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
  ): Promise<ExternalToolCatalog> {
    integrationRegistrationSchema.parse({
      name: "discovery",
      kind: "mcp_http",
      destination: connection.destination,
    });
    let session: string | undefined,
      protocol = "2025-11-25",
      totalBytes = 0;
    const fail = () =>
      new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Descoberta MCP indisponível, inválida ou acima dos limites.",
      );
    const send = async (
      method: string,
      params: unknown,
      notification = false,
    ): Promise<unknown> => {
      const id = randomUUID();
      const response = await this.http.send(
        {
          url: new URL(connection.destination),
          method: "POST",
          headers: {
            ...externalHeaders(connection),
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            "Accept-Encoding": "identity",
            ...(session ? { "Mcp-Session-Id": session } : {}),
            ...(method !== "initialize" ? { "MCP-Protocol-Version": protocol } : {}),
          },
          body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id }), method, params }),
          signal,
          maxBytes: Math.min(524288, 1048576 - totalBytes),
        },
        beforeDispatch,
      );
      totalBytes += Buffer.byteLength(response.body);
      if (totalBytes >= 1048576) throw fail();
      const offered = response.headers["mcp-session-id"];
      if (offered) {
        if (!/^[\x21-\x7e]{1,256}$/.test(offered) || (session && offered !== session)) throw fail();
        session = offered;
      }
      if (notification) {
        if (response.status !== 202 && response.status !== 204) throw fail();
        return null;
      }
      return externalRpcResult(response, id);
    };
    try {
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
      return { tools: await listExternalTools(send), complete: true };
    } catch (error) {
      if (error instanceof PersonaV2Error) throw error;
      throw fail();
    }
  }
}
