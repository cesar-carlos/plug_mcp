import { expect, it } from "vitest";
import { hubAgentResponse } from "../helpers/hub-agent-response.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
const id = "11111111-1111-4111-8111-111111111111";
it("fixture compartilhada satisfaz o contrato HTTP real e valida a identidade solicitada", async () => {
  const adapter = new PlugServerRestAdapter(
    "http://fixture.test",
    new SilentTestLogger(),
    async () => new Response(JSON.stringify(hubAgentResponse(id))),
  );
  await expect(adapter.getAgentAccessStatus("synthetic", id)).resolves.toMatchObject({
    agentId: id,
    state: "approved",
    sourceIdentity: 1,
  });
  await expect(
    adapter.getAgentAccessStatus("synthetic", "22222222-2222-4222-8222-222222222222"),
  ).rejects.toMatchObject({ code: "PLUG_SERVER_ERROR" });
  expect(() => hubAgentResponse("invalid")).toThrow();
});
it("resposta antiga sem identidade continua recusada", async () => {
  const { agentId: _ignored, ...agent } = hubAgentResponse(id).agent;
  const adapter = new PlugServerRestAdapter(
    "http://fixture.test",
    new SilentTestLogger(),
    async () => new Response(JSON.stringify({ agent })),
  );
  await expect(adapter.getAgentAccessStatus("synthetic", id)).rejects.toMatchObject({
    code: "PLUG_SERVER_ERROR",
    retryable: false,
  });
});
