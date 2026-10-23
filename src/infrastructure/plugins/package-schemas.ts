import { z } from "zod";

export const pluginRuntimeSchema = z.enum(["legacy", "persona-v2"]);
export type PluginRuntime = z.infer<typeof pluginRuntimeSchema>;
export const pluginVariantSchema = z.enum(["chatgpt", "portable"]);
export type PluginVariant = z.infer<typeof pluginVariantSchema>;
export const PACKAGE_PROFILE = "se7e-package-v1";

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
export const relativePluginPath = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9._/-]+$/)
  .refine(
    (p) =>
      !p.startsWith("/") &&
      p.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Caminho relativo inválido.",
  );
const interfaceSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(64),
  shortDescription: z.string().trim().min(1).max(30),
  capabilities: z.array(z.enum(["Read", "Write", "Interactive"])).min(1),
  logo: relativePluginPath,
  composerIcon: relativePluginPath,
});
/** Supported Se7e profile of Agent Plugins 1.0, narrower than the upstream format. */
export const pluginManifestSchema = z.strictObject({
  $schema: z.literal("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"),
  name: z.literal("se7e"),
  version: z.string().regex(semver),
  description: z.string().trim().min(1).max(1024),
  extensions: z
    .strictObject({
      "com.openai": z.strictObject({
        apps: z.literal("./.app.json").optional(),
        interface: interfaceSchema,
      }),
    })
    .optional(),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export const pluginSkillSchema = z.strictObject({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .max(64),
  description: z.string().trim().min(1).max(1024),
  metadata: z.strictObject({
    runtime: pluginRuntimeSchema,
    tools: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(1),
  }),
});
export const pluginRecordSchema = z.strictObject({
  format: z.literal(PACKAGE_PROFILE),
  runtime: pluginRuntimeSchema,
  variant: pluginVariantSchema,
  publicBaseUrl: z.string().url(),
  resource: z.string().url(),
  version: z.string().regex(semver),
  connectionId: z.string().optional(),
  toolCatalogHash: z.string().regex(/^[a-f0-9]{64}$/),
  files: z
    .array(
      z.strictObject({
        path: relativePluginPath,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(128),
});
export type PluginRecord = z.infer<typeof pluginRecordSchema>;
export const PLUGIN_SKILL_DIRECTORIES = [
  "se7e-consulta",
  "se7e-treinamento-administracao",
] as const;
