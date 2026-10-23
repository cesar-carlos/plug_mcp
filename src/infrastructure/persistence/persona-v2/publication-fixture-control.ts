import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, realpath, lstat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { PublicationFixtureControlPort } from "../../../domain/ports/publication-fixture.port.js";
import type { Source } from "../../../domain/persona-v2/model.js";
import type { PublicationFixtureSeed } from "../../../domain/persona-v2/publication-fixture.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { fixtureTablesSchema } from "../../../domain/persona-v2/publication-fixture.js";

export const publicationRunManifestSchema = z
  .strictObject({
    version: z.literal(1),
    runId: z.string().regex(/^se7e_persona_[a-f0-9]{12}_test$/),
    sessionRoot: z.string().min(1),
    hubUrl: z
      .string()
      .url()
      .refine((raw) => {
        const url = new URL(raw);
        return (
          url.protocol === "http:" &&
          url.hostname === "127.0.0.1" &&
          !!url.port &&
          url.pathname === "/" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }),
    personaId: z.uuid(),
    skillId: z.uuid(),
    bindings: z
      .array(
        z.strictObject({
          sourceId: z.uuid(),
          fixtureSourceId: z.uuid(),
          tables: fixtureTablesSchema,
        }),
      )
      .min(1)
      .max(4),
  })
  .refine(
    (m) =>
      new Set(m.bindings.map((b) => b.sourceId)).size === m.bindings.length &&
      new Set(m.bindings.map((b) => b.fixtureSourceId)).size === m.bindings.length,
  );

/** Operator manifests stay in the live, owned companion directory; no credentials are accepted. */
export async function readPublicationRunManifest(
  path: string,
): Promise<z.infer<typeof publicationRunManifestSchema>> {
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 256 * 1024)
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Manifesto precisa ser arquivo regular limitado, sem link simbólico.",
    );
  const manifest = publicationRunManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const session = await realpath(manifest.sessionRoot),
    root = dirname(session);
  if (
    session !== (await realpath(dirname(path))) ||
    !/^chain-[a-f0-9]{32}$/.test(basename(session)) ||
    basename(root) !== manifest.runId ||
    dirname(root) !== (await realpath(tmpdir()))
  )
    throw new PersonaV2Error(
      "AUTHORIZATION_DENIED",
      "Manifesto fora da sessão de fixture isolada.",
    );
  const parent = JSON.parse(await readFile(join(session, "manifest.json"), "utf8")) as {
    runId?: string;
    sessionRoot?: string;
  };
  if (parent.runId !== manifest.runId || parent.sessionRoot !== manifest.sessionRoot)
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão de fixture divergente.");
  return manifest;
}

/** Local fixture provisioning is not a public hub/MCP command and accepts no SQL. */
export class LocalPublicationFixtureControl implements PublicationFixtureControlPort {
  private poisoned = false;
  constructor(private readonly sessionRoot: string) {}
  prepare(source: Source, seeds: readonly PublicationFixtureSeed[]): Promise<void> {
    return this.job(source, "publication-prepare", seeds);
  }
  clear(source: Source): Promise<void> {
    return this.job(source, "publication-clear");
  }
  private async job(
    source: Source,
    kind: string,
    seeds?: readonly PublicationFixtureSeed[],
  ): Promise<void> {
    if (this.poisoned)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Controle da fixture incerto; não repetir.");
    const path = join(this.sessionRoot, `${randomUUID()}.case-job.json`);
    try {
      await writeFile(`${path}.tmp`, JSON.stringify({ kind, engine: source.dialect, seeds }), {
        flag: "wx",
      });
      await rename(`${path}.tmp`, path);
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        let raw: string;
        try {
          raw = await readFile(`${path}.result`, "utf8");
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
            throw error;
          await delay(100);
          continue;
        }
        if ((JSON.parse(raw) as { passed?: boolean }).passed !== true)
          throw new Error("Private fixture control refused; discard, never retry.");
        return;
      }
      throw new Error("Private fixture timeout; discard, never retry.");
    } catch (error) {
      this.poisoned = true;
      throw error;
    }
  }
}
