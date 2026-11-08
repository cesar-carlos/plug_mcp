import { z } from "zod";

/** Shared HTTP fixture, exercising the adapter contract instead of bypassing it. */
export function hubAgentResponse(agentId: string) {
  return {
    agent: {
      agentId: z.uuid().parse(agentId),
      isHubConnected: true,
      hasClientToken: true,
      sourceIdentity: 1,
      sqlOperations: { version: 1, maxSteps: 32, maxAffectedRows: 100000, timeoutMs: 300000 },
    },
  };
}
