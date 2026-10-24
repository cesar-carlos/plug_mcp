import { z } from "zod";

// REST normalizes the agent JSON-RPC response; HTTP 200 alone is not success.
export const nativeDiscoverySchema = z.object({
  response: z.object({
    type: z.literal("single"),
    success: z.literal(true),
    item: z.object({
      success: z.literal(true),
      result: z.object({ openrpc: z.string().min(1) }),
    }),
  }),
});
