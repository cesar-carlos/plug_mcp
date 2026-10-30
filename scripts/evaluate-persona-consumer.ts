import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { evaluatePersonaConsumer } from "../tests/evaluation/persona-v2-evaluator.js";

const reference = z
  .object({
    decision: z.enum(["responder", "esclarecer", "recusar", "indisponivel", "parcial"]),
    rows: z.array(
      z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
    ),
    sources: z.array(z.string().min(1)),
    publications: z.array(z.string().min(1)),
  })
  .strict();
const manifestSchema = z
  .object({
    generation: z.literal("persona-v2"),
    isolatedFixture: z.literal(true),
    datasetAuthorization: z.enum(["synthetic", "explicitly-authorized"]),
    trials: z.number().int().min(1).max(10).optional(),
    candidate: z
      .object({
        mcp: z.string().regex(/^[a-f0-9]{40}$/),
        hub: z.string().regex(/^[a-f0-9]{40}$/),
        agent: z.string().regex(/^[a-f0-9]{40}$/),
      })
      .strict(),
    cases: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9_-]{1,80}$/),
            group: z.enum(["supported", "security", "gap"]),
            question: z.string().min(1).max(16000),
            expected: reference,
            followUps: z
              .array(
                z.strictObject({ question: z.string().min(1).max(16000), expected: reference }),
              )
              .max(10)
              .optional(),
          })
          .strict(),
      )
      .min(3)
      .max(1000),
  })
  .strict();

async function main(): Promise<void> {
  const [manifestPath, transportPath, adapterPath, judgePath, outputPath, ...extra] =
    process.argv.slice(2);
  if (
    process.env.PERSONA_AI_EVAL_ENABLED !== "true" ||
    extra.length ||
    !manifestPath ||
    !transportPath ||
    !adapterPath ||
    !judgePath ||
    !outputPath
  )
    throw new Error("Explicit operator configuration required");
  const bytes = await readFile(resolve(manifestPath));
  if (bytes.length > 4 * 1024 * 1024) throw new Error("Manifest too large");
  const manifest = manifestSchema.parse(JSON.parse(bytes.toString("utf8")));
  // These are trusted operator modules. No remote module or model-produced code is loaded.
  const transport = (await import(pathToFileURL(resolve(transportPath)).href)) as {
    default: { openSession: Parameters<typeof evaluatePersonaConsumer>[0]["openSession"] };
  };
  const adapter = (await import(pathToFileURL(resolve(adapterPath)).href)) as {
    default: Parameters<typeof evaluatePersonaConsumer>[0]["adapter"];
  };
  const judge = (await import(pathToFileURL(resolve(judgePath)).href)) as {
    default: Parameters<typeof evaluatePersonaConsumer>[0]["judge"];
  };
  const report = await evaluatePersonaConsumer({
    ...manifest,
    adapter: adapter.default,
    judge: judge.default,
    openSession: (id) => transport.default.openSession(id),
  });
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      accepted: report.accepted,
      qualityMeasured: report.qualityMeasured,
      cases: report.results.length,
    }),
  );
  if (!report.accepted) process.exitCode = 1;
}
void main().catch(() => {
  // Adapter/transport errors may contain model content or credentials.
  console.error(
    "Persona-v2 evaluation did not complete; inspect the private operator configuration.",
  );
  process.exitCode = 1;
});
