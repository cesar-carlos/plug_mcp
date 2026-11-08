import { z } from "zod";
import { ExternalFailure } from "../../domain/persona-v2/external-failure.js";
import { integrationCredentialSchema } from "../../domain/persona-v2/integration-credential.js";
import type { ExternalConnection } from "../../domain/persona-v2/external-contract.js";
import type { ExternalHttpResponse } from "./external-http.js";
const denied = () => new ExternalFailure("invalid_response", "external_mcp");
const toolPage = z.object({
  tools: z
    .array(
      z.object({
        name: z.string().min(1).max(128),
        description: z.string().max(5000).optional(),
        inputSchema: z.json(),
        outputSchema: z.json().optional(),
        annotations: z.object({ readOnlyHint: z.boolean().optional() }).passthrough().optional(),
      }),
    )
    .max(256),
  nextCursor: z.string().min(1).max(2048).optional(),
});
/** Complete bounded listing is required to reject duplicate names across pages. */
export async function listExternalTools(
  send: (method: string, params: unknown) => Promise<unknown>,
): Promise<z.infer<typeof toolPage>["tools"]> {
  const tools: z.infer<typeof toolPage>["tools"] = [],
    names = new Set<string>(),
    cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const parsed = toolPage.safeParse(await send("tools/list", cursor ? { cursor } : {}));
    if (!parsed.success) throw denied();
    const result = parsed.data;
    for (const tool of result.tools) {
      if (names.has(tool.name) || tools.length >= 256)
        throw new ExternalFailure("listing_incomplete", "external_mcp");
      names.add(tool.name);
      tools.push(tool);
    }
    if (!result.nextCursor) return tools;
    if (cursors.has(result.nextCursor))
      throw new ExternalFailure("listing_incomplete", "external_mcp");
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new ExternalFailure("listing_incomplete", "external_mcp");
}
export const externalHeaders = (connection: ExternalConnection): Record<string, string> => {
  const c = integrationCredentialSchema.parse(connection.credential);
  return c.credentialType === "bearer"
    ? { Authorization: `Bearer ${c.token}` }
    : c.credentialType === "basic"
      ? { Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}` }
      : { [c.header]: c.apiKey };
};
export const externalRpcResult = (response: ExternalHttpResponse, id: string): unknown => {
  const parse = (text: string): unknown => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw denied();
    }
  };
  const type = response.headers["content-type"]?.split(";")[0]?.trim();
  const messages =
    type === "application/json"
      ? [parse(response.body)]
      : type === "text/event-stream"
        ? response.body
            .replaceAll("\r\n", "\n")
            .split("\n\n")
            .filter((s) => s.split("\n").some((l) => l.startsWith("data:")))
            .map((s) =>
              parse(
                s
                  .split("\n")
                  .filter((l) => l.startsWith("data:"))
                  .map((l) => l.slice(5).trimStart())
                  .join("\n"),
              ),
            )
        : [];
  const replies = messages.filter((m) => !!m && typeof m === "object" && "id" in m && m.id === id);
  if (replies.length !== 1) throw denied();
  const parsed = z
    .object({
      jsonrpc: z.literal("2.0"),
      id: z.literal(id),
      result: z.unknown().optional(),
      error: z.unknown().optional(),
    })
    .safeParse(replies[0]);
  if (!parsed.success) throw denied();
  const reply = parsed.data;
  if (reply.error !== undefined) {
    if (reply.result !== undefined) throw denied();
    const remote = z.object({ code: z.number().int(), message: z.string() }).safeParse(reply.error);
    if (!remote.success) throw denied();
    throw new ExternalFailure("rpc_error", "external_mcp", remote.data.code);
  }
  if (reply.result === undefined) throw denied();
  return reply.result;
};
