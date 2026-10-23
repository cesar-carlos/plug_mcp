import { z } from "zod";
import { integrationCredentialSchema } from "../../domain/persona-v2/integration-credential.js";
import type { ExternalConnection } from "../../domain/persona-v2/external-contract.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { ExternalHttpResponse } from "./external-http.js";
const denied = () =>
  new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Contrato externo mudou ou resposta inválida.");
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
    const result = toolPage.parse(await send("tools/list", cursor ? { cursor } : {}));
    for (const tool of result.tools) {
      if (names.has(tool.name) || tools.length >= 256) throw denied();
      names.add(tool.name);
      tools.push(tool);
    }
    if (!result.nextCursor) return tools;
    if (cursors.has(result.nextCursor)) throw denied();
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw denied();
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
  const type = response.headers["content-type"]?.split(";")[0]?.trim();
  const messages =
    type === "application/json"
      ? [JSON.parse(response.body) as unknown]
      : type === "text/event-stream"
        ? response.body
            .replaceAll("\r\n", "\n")
            .split("\n\n")
            .filter((s) => s.split("\n").some((l) => l.startsWith("data:")))
            .map(
              (s) =>
                JSON.parse(
                  s
                    .split("\n")
                    .filter((l) => l.startsWith("data:"))
                    .map((l) => l.slice(5).trimStart())
                    .join("\n"),
                ) as unknown,
            )
        : [];
  const replies = messages.filter((m) => !!m && typeof m === "object" && "id" in m && m.id === id);
  if (replies.length !== 1) throw denied();
  const reply = z
    .object({
      jsonrpc: z.literal("2.0"),
      id: z.literal(id),
      result: z.unknown(),
      error: z.unknown().optional(),
    })
    .parse(replies[0]);
  if (reply.error || reply.result === undefined) throw denied();
  return reply.result;
};
