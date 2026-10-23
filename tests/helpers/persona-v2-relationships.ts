import { structureContentSchema } from "../../src/domain/persona-v2/structure-content-schema.js";
import { sourceSchemaResultSchema } from "../../src/domain/persona-v2/source-schema.js";
import { sourceProof, trainingSource } from "./persona-v2-training.js";
import { queryTrainingSchema } from "../../src/application/persona-v2/query-training.js";

/** Synthetic composite keys and non-equal endpoint IDs, never a Data7 declaration. */
export function relationshipFixture() {
  const tables = [
    { id: "rel_left", columns: ["tenant_id", "left_id"], grain: ["tenant_id", "left_id"] },
    {
      id: "rel_link",
      columns: ["tenant_id", "left_id", "right_id"],
      grain: ["tenant_id", "left_id", "right_id"],
    },
    { id: "rel_right", columns: ["tenant_id", "right_id"], grain: ["tenant_id", "right_id"] },
  ].map((t) => ({
    id: t.id,
    name: t.id,
    meaning: `Registro sintético ${t.id}`,
    resourceType: "table",
    grain: t.grain,
    physicalNames: [{ dialect: "postgres", name: `public.${t.id}` }],
    columns: t.columns.map((name) => ({
      name,
      meaning: `Campo ${name}`,
      logicalType: "integer",
      nullable: false,
      classification: "livre",
      nativeTypes: [{ dialect: "postgres", type: "int4" }],
    })),
  }));
  const content = structureContentSchema.parse({
    system: "Fixture",
    label: "1",
    dialects: ["postgres"],
    tables,
    rules: [],
    examples: [],
    relationships: [
      {
        id: "left_links",
        from: "rel_left",
        to: "rel_link",
        keys: [
          { from: "tenant_id", to: "tenant_id" },
          { from: "left_id", to: "left_id" },
        ],
        join: "inner",
        cardinality: "1:N",
        optional: false,
        meaning: "Elos do lado esquerdo",
        via: [],
        origin: "database",
        constraintName: "fk_rel_left",
        constraintStatus: "enabled",
      },
      {
        id: "link_right",
        from: "rel_link",
        to: "rel_right",
        keys: [
          { from: "tenant_id", to: "tenant_id" },
          { from: "right_id", to: "right_id" },
        ],
        join: "inner",
        cardinality: "N:1",
        optional: false,
        meaning: "Destino do elo",
        via: [],
        origin: "database",
        constraintName: "fk_rel_right",
        constraintStatus: "enabled",
      },
      {
        id: "left_right",
        from: "rel_left",
        to: "rel_right",
        keys: [
          { from: "tenant_id", to: "tenant_id" },
          { from: "left_id", to: "right_id" },
        ],
        join: "inner",
        cardinality: "N:N",
        optional: false,
        meaning: "Associação pela intermediária",
        via: ["rel_link"],
        path: ["left_links", "link_right"],
        origin: "database",
        constraintStatus: "enabled",
      },
    ],
  });
  const evidence = sourceSchemaResultSchema.parse({
    contractVersion: 1,
    identity: sourceProof(),
    observedAt: new Date().toISOString(),
    metadataPage: { offset: 0, pageSize: 3, nextOffset: null },
    resources: content.tables.map((t) => ({
      resource: { schema: "public", name: t.name, type: "table" },
      status: "available",
      columns: t.columns.map((c, index) => ({
        name: c.name,
        nativeType: "int4",
        nullable: false,
        ordinal: index + 1,
        size: 10,
        scale: 0,
      })),
      primaryKeys: [],
      uniqueKeys: [],
      foreignKeys:
        t.id === "rel_link"
          ? [
              {
                name: "fk_rel_left",
                columns: ["tenant_id", "left_id"],
                target: { schema: "public", name: "rel_left", type: "table" },
                targetColumns: ["tenant_id", "left_id"],
                status: "enabled",
              },
              {
                name: "fk_rel_right",
                columns: ["tenant_id", "right_id"],
                target: { schema: "public", name: "rel_right", type: "table" },
                targetColumns: ["tenant_id", "right_id"],
                status: "enabled",
              },
            ]
          : [],
      coverage: {
        columns: true,
        primaryKeys: true,
        uniqueKeys: true,
        foreignKeys: true,
        constraintStatus: true,
      },
      limitations: [],
    })),
  });
  const physical = (id: string) => `public.${id}`;
  const training = queryTrainingSchema.parse({
    sourceId: trainingSource.id,
    dialect: "postgres",
    purpose: "Associações sintéticas",
    sqlModel:
      'SELECT a.left_id AS "left_id",b.right_id AS "right_id" FROM public.rel_left a INNER JOIN public.rel_link j ON a.tenant_id=j.tenant_id AND a.left_id=j.left_id INNER JOIN public.rel_right b ON j.tenant_id=b.tenant_id AND j.right_id=b.right_id WHERE a.tenant_id=:tenant ORDER BY a.left_id,b.right_id',
    tables: content.tables.map((t) => ({
      name: physical(t.id),
      meaning: t.meaning,
      grain: t.grain,
      resourceType: t.resourceType,
    })),
    columns: content.tables.flatMap((t) =>
      t.columns.map((c) => ({
        table: physical(t.id),
        name: c.name,
        meaning: c.meaning,
        classification: c.classification,
      })),
    ),
    relationships: content.relationships.map((r) => ({
      id: r.id,
      from: physical(r.from),
      to: physical(r.to),
      keys: r.keys,
      join: r.join,
      cardinality: r.cardinality,
      meaning: r.meaning,
      ...(r.via.length ? { via: r.via.map(physical), path: r.path } : {}),
    })),
    rules: [],
    parameters: [{ name: "tenant", type: "integer", required: true, meaning: "Locatário" }],
  });
  return { content, evidence, training };
}
