import { createHash } from "node:crypto";
import { z } from "zod";
import { PERSONA_CONSUMER_GUIDANCE } from "../../application/persona-v2/consumer-guidance.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../application/persona-v2/runtime-instructions.js";
import { pluginToolCatalogHash } from "./tool-catalog.js";
import { trainingManifest, TRAINING_TOPICS } from "../../application/persona-v2/training-topics.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const training = trainingManifest();
const trainingTopicsHash = hash(canonicalJson(training.topics));
export const personaCompatibilitySchema = z.strictObject({
  format: z.literal("persona-plugin-compatibility-v2"),
  runtime: z.literal("persona-v2"),
  variant: z.enum(["portable", "chatgpt"]),
  instructionsHash: z.string().regex(/^[a-f0-9]{64}$/),
  guidanceHash: z.string().regex(/^[a-f0-9]{64}$/),
  toolCatalogHash: z.string().regex(/^[a-f0-9]{64}$/),
  trainingBaseHash: z.string().regex(/^[a-f0-9]{64}$/),
  trainingTopicsHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export function personaPluginCompatibility(
  variant: "portable" | "chatgpt",
): z.infer<typeof personaCompatibilitySchema> {
  return {
    format: "persona-plugin-compatibility-v2",
    runtime: "persona-v2",
    variant,
    instructionsHash: hash(PERSONA_V2_INSTRUCTIONS),
    guidanceHash: hash(PERSONA_CONSUMER_GUIDANCE),
    toolCatalogHash: pluginToolCatalogHash("persona-v2", variant),
    trainingBaseHash: training.baseHash,
    trainingTopicsHash,
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

export interface PersonaCompatibilityDiagnosis {
  compatible: boolean;
  differences: string[];
  diagnostics: { component: string; reason: string; action: string }[];
  installedPackageVerified: false;
}

/** A local snapshot is evidence of comparison, never proof of a live installation. */
export function checkPluginDeploymentRevision(
  expected: string,
  actual: unknown,
): {
  revisionMatches: boolean;
  liveServerVerified: false;
  installedPackageVerified: false;
  diagnostics: PersonaCompatibilityDiagnosis["diagnostics"];
} {
  const valid = /^[a-f0-9]{40}$/;
  const revisionMatches =
    valid.test(expected) && typeof actual === "string" && valid.test(actual) && actual === expected;
  return {
    revisionMatches,
    liveServerVerified: false,
    installedPackageVerified: false,
    diagnostics: revisionMatches
      ? []
      : [
          {
            component: "serverRevision",
            reason: "missing_or_different",
            action:
              "Obtenha novamente obter_capacidades após o deploy e confira o SHA completo esperado com a versão do servidor e do worker.",
          },
        ],
  };
}

/** Never echo untrusted values, paths or unknown field names into the diagnostic. */
export function diagnosePersonaPlugin(
  packageValue: unknown,
  serverValue: unknown,
  packageTraining?: unknown,
  serverTraining?: unknown,
): PersonaCompatibilityDiagnosis {
  const pkg = personaCompatibilitySchema.safeParse(packageValue);
  const server = personaCompatibilitySchema.safeParse(serverValue);
  const keys = Object.keys(personaCompatibilitySchema.shape);
  const diagnostics: PersonaCompatibilityDiagnosis["diagnostics"] = [];
  for (const [side, parsed] of [
    ["package", pkg],
    ["server", server],
  ] as const) {
    if (parsed.success) continue;
    const components = new Set(
      parsed.error.issues.map((issue) => {
        const field = issue.path[0];
        return typeof field === "string" && keys.includes(field) ? field : "contract";
      }),
    );
    for (const component of components)
      diagnostics.push({
        component,
        reason: `${side}_invalid`,
        action:
          side === "package"
            ? "Remonte o pacote a partir da revisão compatível com o servidor usando plugin:package; valide com plugin:check e compare novamente."
            : "Obtenha novamente obter_capacidades na conexão desejada e confira a revisão do servidor; o contrato v2 completo é obrigatório.",
      });
  }
  if (pkg.success && server.success) {
    for (const component of comparePersonaPlugin(pkg.data, server.data).differences)
      diagnostics.push({
        component,
        reason: "different",
        action:
          component === "variant"
            ? "Escolha a variante correspondente à conexão: portable para Bearer ou chatgpt para OAuth; remonte e valide o pacote."
            : "Revise a revisão do servidor, remonte com plugin:package a partir da mesma revisão, valide com plugin:check e execute plugin:compare novamente. Isso não atualiza a instalação no cliente.",
      });
  }
  if (
    pkg.success &&
    server.success &&
    (packageTraining !== undefined || serverTraining !== undefined)
  ) {
    const schema = z.strictObject({
      version: z.string().min(1).max(100),
      baseHash: z.string().regex(/^[a-f0-9]{64}$/),
      topics: z
        .array(
          z.strictObject({
            topic: z.enum(TRAINING_TOPICS),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z.number().int().positive(),
          }),
        )
        .length(TRAINING_TOPICS.length),
    });
    const a = schema.safeParse(packageTraining),
      b = schema.safeParse(serverTraining);
    const valid = (
      value: z.infer<typeof schema>,
      contract: z.infer<typeof personaCompatibilitySchema>,
    ) =>
      value.baseHash === contract.trainingBaseHash &&
      hash(canonicalJson(value.topics)) === contract.trainingTopicsHash &&
      new Set(value.topics.map((entry) => entry.topic)).size === value.topics.length;
    if (
      (packageTraining !== undefined && (!a.success || !valid(a.data, pkg.data))) ||
      (serverTraining !== undefined && (!b.success || !valid(b.data, server.data)))
    ) {
      diagnostics.push({
        component: "trainingManifest",
        reason: "invalid",
        action:
          "Obtenha o manifesto gerado com o pacote e training de obter_capacidades; os hashes agregados precisam corresponder. Não altere os hashes manualmente.",
      });
    } else if (a.success && b.success)
      for (const topic of TRAINING_TOPICS) {
        const left = a.data.topics.find((entry) => entry.topic === topic),
          right = b.data.topics.find((entry) => entry.topic === topic);
        if (left?.contentHash !== right?.contentHash || left?.bytes !== right?.bytes)
          diagnostics.push({
            component: `trainingTopics.${topic}`,
            reason: !left ? "package_missing" : !right ? "server_missing" : "different",
            action: `Revise o guia ${topic} na revisão do servidor e remonte com plugin:package; valide com plugin:check. Isso não atualiza a instalação no cliente.`,
          });
      }
  }
  return {
    compatible: diagnostics.length === 0,
    differences: [...new Set(diagnostics.map((item) => item.component))],
    diagnostics,
    installedPackageVerified: false,
  };
}
