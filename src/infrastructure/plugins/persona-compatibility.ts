import { createHash } from "node:crypto";
import { z } from "zod";
import { PERSONA_CONSUMER_GUIDANCE } from "../../application/persona-v2/consumer-guidance.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../application/persona-v2/runtime-instructions.js";
import { pluginToolCatalogHash } from "./tool-catalog.js";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
export const personaCompatibilitySchema = z.strictObject({
  format: z.literal("persona-plugin-compatibility-v1"),
  runtime: z.literal("persona-v2"),
  variant: z.enum(["portable", "chatgpt"]),
  instructionsHash: z.string().regex(/^[a-f0-9]{64}$/),
  guidanceHash: z.string().regex(/^[a-f0-9]{64}$/),
  toolCatalogHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export function personaPluginCompatibility(
  variant: "portable" | "chatgpt",
): z.infer<typeof personaCompatibilitySchema> {
  return {
    format: "persona-plugin-compatibility-v1",
    runtime: "persona-v2",
    variant,
    instructionsHash: hash(PERSONA_V2_INSTRUCTIONS),
    guidanceHash: hash(PERSONA_CONSUMER_GUIDANCE),
    toolCatalogHash: pluginToolCatalogHash("persona-v2", variant),
  };
}
export function comparePersonaPlugin(
  packageValue: unknown,
  serverValue: unknown,
): { compatible: boolean; differences: string[]; installedPackageVerified: false } {
  const pkg = personaCompatibilitySchema.parse(packageValue);
  const server = personaCompatibilitySchema.parse(serverValue);
  const differences = (Object.keys(pkg) as (keyof typeof pkg)[]).filter(
    (key) => pkg[key] !== server[key],
  );
  return { compatible: differences.length === 0, differences, installedPackageVerified: false };
}
