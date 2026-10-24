import { z } from "zod";
import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { compileQueryTraining } from "./query-training.js";

export { structureContentSchema } from "../../domain/persona-v2/structure-content-schema.js";
import { structureContentSchema } from "../../domain/persona-v2/structure-content-schema.js";
export const knowledgeRoleSchema = z.enum(["administrator", "curator", "contributor", "reader"]);

export const structureDraftInputSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(100),
  name: z.string().trim().min(1).max(200),
  content: structureContentSchema,
});
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

/** Validates a proposed standard, never attests an actual database or approves business semantics. */
export const validateStructureContent = (raw: unknown, crypto: CryptoPort): StructureContent => {
  const content = structureContentSchema.parse(raw);
  const tables = new Map(content.tables.map((t) => [t.id, t]));
  const relationships = new Map(content.relationships.map((r) => [r.id, r]));
  const invalid =
    !unique(content.dialects) ||
    !unique(content.tables.map((t) => t.id)) ||
    !unique(content.relationships.map((r) => r.id)) ||
    !unique(content.examples.map((e) => e.id)) ||
    content.tables.some(
      (t) =>
        t.name.split(".").at(-1) === "se7e_source_identity" ||
        !unique(t.columns.map((c) => c.name)) ||
        t.columns.some(
          (c) =>
            !unique((c.nativeTypes ?? []).map((n) => n.dialect)) ||
            (c.nativeTypes ?? []).some(
              (n) =>
                !content.dialects.includes(n.dialect) ||
                (n.scale !== undefined && (n.precision === undefined || n.scale > n.precision)),
            ),
        ) ||
        !unique((t.keys ?? []).map((k) => k.id)) ||
        (t.keys ?? []).filter((k) => k.kind === "primary").length > 1 ||
        (t.keys ?? []).some(
          (k) =>
            !unique(k.columns) || k.columns.some((c) => !t.columns.some((col) => col.name === c)),
        ) ||
        !unique(t.grain) ||
        t.grain.some((key) => !t.columns.some((c) => c.name === key)) ||
        !unique(t.physicalNames.map((n) => n.dialect)) ||
        t.physicalNames.some(
          (n) =>
            !content.dialects.includes(n.dialect) ||
            n.name.split(".").at(-1) === "se7e_source_identity",
        ),
    ) ||
    content.relationships.some(
      (r) =>
        !tables.has(r.from) ||
        !tables.has(r.to) ||
        !unique(r.via) ||
        r.via.includes(r.from) ||
        r.via.includes(r.to) ||
        r.via.some((t) => !tables.has(t)) ||
        !unique(r.keys.map((k) => `${k.from}:${k.to}`)) ||
        !unique(r.keys.map((k) => k.from)) ||
        !unique(r.keys.map((k) => k.to)) ||
        ((r.origin === "business" || r.origin === undefined) &&
          (r.constraintName !== undefined || r.constraintStatus !== undefined)) ||
        (r.via.length === 0 && (r.path?.length ?? 0) !== 0) ||
        (r.via.length > 0 &&
          (r.cardinality !== "N:N" ||
            r.path?.length !== r.via.length + 1 ||
            !unique(r.path ?? []) ||
            (r.path ?? []).some((edgeId, index) => {
              const edge = relationships.get(edgeId),
                nodes = [r.from, ...r.via, r.to];
              return (
                !edge ||
                edge.id === r.id ||
                edge.via.length > 0 ||
                edge.cardinality === "N:N" ||
                !(
                  (edge.from === nodes[index] && edge.to === nodes[index + 1]) ||
                  (edge.to === nodes[index] && edge.from === nodes[index + 1])
                )
              );
            }))) ||
        r.keys.some(
          (k) =>
            !tables.get(r.from)?.columns.some((c) => c.name === k.from) ||
            !tables.get(r.to)?.columns.some((c) => c.name === k.to),
        ),
    ) ||
    content.examples.some(
      (e) =>
        !unique(e.variants.map((v) => v.dialect)) ||
        e.variants.some((v) => !content.dialects.includes(v.dialect)),
    );
  if (invalid || pareceSegredoEmTexto(canonicalJson(content))) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Padrão contém segredo, duplicação ou referência inválida.",
    );
  }
  for (const engine of content.dialects) {
    const physicalName = (tableId: string): string => {
      const table = tables.get(tableId)!;
      return table.physicalNames.find((p) => p.dialect === engine)?.name ?? table.name;
    };
    if (!unique(content.tables.map((t) => physicalName(t.id)))) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Duas entidades apontam para o mesmo recurso físico.",
      );
    }
    for (const example of content.examples) {
      for (const variant of example.variants.filter((v) => v.dialect === engine)) {
        // The synthetic source only invokes the pure SQL compiler. It is never a source proof.
        compileQueryTraining(
          {
            sourceId: "00000000-0000-4000-8000-000000000001",
            dialect: engine,
            purpose: example.purpose,
            sqlModel: variant.sql,
            tables: content.tables.map((t) => ({
              name: physicalName(t.id),
              resourceType: t.resourceType,
              meaning: t.meaning,
              grain: t.grain,
            })),
            columns: content.tables.flatMap((t) =>
              t.columns.map((c) => ({
                table: physicalName(t.id),
                name: c.name,
                meaning: c.meaning,
                classification: c.classification,
              })),
            ),
            relationships: content.relationships
              .filter((r) => r.via.length === 0)
              .map((r) => ({
                from: physicalName(r.from),
                to: physicalName(r.to),
                keys: r.keys,
                join: r.join,
                cardinality: r.cardinality,
                meaning: r.meaning,
              })),
            rules: content.rules,
            parameters: variant.parameters,
          },
          {
            id: "00000000-0000-4000-8000-000000000001",
            personaId: "validation",
            physicalSourceId: "validation",
            credentialId: "validation",
            credentialVersion: 1,
            name: "Compiler only",
            purpose: "Structural validation",
            environment: "validation",
            agentId: "validation",
            database: "validation",
            dialect: engine,
            authorizationVersion: 1,
            active: true,
          },
          crypto,
        );
      }
    }
  }
  return content;
};
