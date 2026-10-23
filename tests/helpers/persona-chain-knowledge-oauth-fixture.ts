import { expect } from "vitest";
import type { Response } from "supertest";
import type { Source } from "../../src/domain/persona-v2/model.js";
import type { SourceSchemaEvidence } from "../../src/domain/persona-v2/source-schema.js";
import { reviewDateFixture } from "./review-deadline.js";

/** Independent OAuth journey: real published pattern/profile versions, without replaying editorial tests. */
export async function prepareKnowledgeHistoryOAuth(c: {
  personaId: string;
  source: Source;
  inspection: { id: string; evidence: SourceSchemaEvidence };
  post: (path: string, body: object) => PromiseLike<Response>;
  publish: (id: string) => Promise<{ publicationId: string; capabilities: string[] }>;
  issue: (
    grants: { skillId: string; capabilities: string[]; effects: string[] }[],
  ) => Promise<string>;
}): Promise<{ oldSkill: string; newSkill: string; originator: string }> {
  const post = async <T>(path: string, body: object, status: number): Promise<T> => {
    const response = await c.post(path, body);
    expect(response.status).toBe(status);
    return response.body as T;
  };
  const dialect = c.source.dialect;
  const observed = c.inspection.evidence.resources.find((r) => r.resource.name === "schema_parent");
  expect(observed?.status).toBe("available");
  const qualified = `${observed!.resource.schema}.${observed!.resource.name}`;
  const name = dialect === "sybase" ? qualified.toLowerCase() : qualified;
  const childName = `${observed!.resource.schema}.schema_child`;
  const content = {
    system: "Independent OAuth fixture",
    label: "1.0",
    dialects: [dialect],
    tables: [
      {
        id: "parent",
        name: "schema_parent",
        meaning: "Registro sintético por tenant e item",
        resourceType: "table",
        grain: ["tenant_id", "item_id"],
        physicalNames: [{ dialect, name }],
        columns: observed!.columns.map((column) => ({
          name: column.name.toLowerCase(),
          meaning: column.name.toLowerCase(),
          logicalType: "integer",
          nullable: column.nullable,
          classification: "livre",
          nativeTypes: [{ dialect, type: column.nativeType }],
        })),
        ...(dialect === "sybase"
          ? {}
          : {
              keys: [
                {
                  id: "parent-key",
                  kind: "primary",
                  columns: ["tenant_id", "item_id"],
                  status: "enabled",
                },
                {
                  id: "parent-unique",
                  kind: "unique",
                  columns: ["item_id", "tenant_id"],
                  status: "enabled",
                },
              ],
            }),
      },
    ],
    relationships:
      dialect === "sybase"
        ? []
        : [
            {
              id: "child-parent",
              from: "child",
              to: "parent",
              keys: [
                { from: "tenant_id", to: "tenant_id" },
                { from: "item_id", to: "item_id" },
              ],
              join: "inner",
              cardinality: "N:1",
              optional: false,
              meaning: "Filho aponta ao pai sintético pela chave composta",
              via: [],
              origin: "database",
              constraintName: "fk_schema_parent",
              constraintStatus: "enabled",
            },
          ],
    examples: [],
    rules: [],
  };
  if (dialect !== "sybase") {
    content.tables.push({
      ...content.tables[0]!,
      id: "child",
      name: "schema_child",
      meaning: "Registro filho sintético",
      physicalNames: [{ dialect, name: childName }],
      keys: [
        { id: "child-key", kind: "primary", columns: ["tenant_id", "item_id"], status: "enabled" },
      ],
    });
  }
  const catalog = await post<{ catalog: { id: string } }>(
    "/api/admin/catalogos",
    { name: `OAuth fixture ${dialect}` },
    201,
  );
  const catalogId = catalog.catalog.id;
  const pattern = await post<{ pattern: { id: string } }>(
    `/api/admin/catalogos/${catalogId}/padroes`,
    { slug: `oauth-structure-${dialect}`, name: "Estrutura OAuth", content },
    201,
  );
  const root = `/api/admin/catalogos/${catalogId}/padroes/${pattern.pattern.id}`;
  const publishPattern = async () => {
    const preview = await post<{ confirmationHash: string }>(`${root}/preview`, {}, 200);
    return (
      await post<{ publication: { id: string } }>(
        `${root}/publicar`,
        { confirmationHash: preview.confirmationHash },
        201,
      )
    ).publication.id;
  };
  const firstVersion = await publishPattern();
  const profileContent = {
    ...content,
    tables: content.tables.map((t) => ({
      ...t,
      meaning: t.id === "parent" ? "Particularidade OAuth desta base" : t.meaning,
    })),
  };
  const profileRoot = `/api/admin/personas/${c.personaId}/fontes/${c.source.id}/perfis`;
  const profile = await post<{ profile: { id: string } }>(
    `${profileRoot}/salvar`,
    {
      catalogId,
      basePublicationId: firstVersion,
      name: "Perfil OAuth",
      content: profileContent,
      overrides: { tables: ["parent"], relationships: [] },
    },
    201,
  );
  const review = {
    catalogId,
    profileId: profile.profile.id,
    evidenceId: c.inspection.id,
    reviewDueAt: reviewDateFixture(),
  };
  const preview = await post<{ confirmationHash: string }>(`${profileRoot}/preview`, review, 200);
  const profilePublication = await post<{ publicationId: string }>(
    `${profileRoot}/publicar`,
    { ...review, confirmationHash: preview.confirmationHash },
    200,
  );
  const makeSkill = async (publicationId: string, old: boolean) => {
    const structure = old ? profileContent : content;
    const draft = await post<{ skill: { id: string } }>(
      `/api/admin/personas/${c.personaId}/skills`,
      {
        slug: `oauth-history-${old ? "old" : "new"}-${dialect}`,
        name: "Consulta OAuth independente",
        kind: "consulta",
        training: {
          sourceId: c.source.id,
          dialect,
          purpose: "Ler conhecimento concedido sem executar SQL",
          sqlModel:
            dialect === "sybase"
              ? `SELECT p.tenant_id AS tenant_id,p.item_id AS item_id FROM ${name} p WHERE p.tenant_id=:tenant ORDER BY p.tenant_id,p.item_id`
              : `SELECT p.tenant_id AS tenant_id,p.item_id AS item_id FROM ${childName} c JOIN ${name} p ON c.tenant_id=p.tenant_id AND c.item_id=p.item_id WHERE c.tenant_id=:tenant ORDER BY p.tenant_id,p.item_id`,
          tables: structure.tables.map((t) => ({
            name: t.physicalNames[0]!.name,
            meaning: t.meaning,
            grain: t.grain,
          })),
          columns: structure.tables.flatMap((t) =>
            t.columns.map((f) => ({
              table: t.physicalNames[0]!.name,
              name: f.name,
              meaning: f.meaning,
              classification: f.classification,
            })),
          ),
          relationships: structure.relationships.map((r) => ({
            from: childName,
            to: name,
            keys: r.keys,
            join: r.join,
            cardinality: r.cardinality,
            meaning: r.meaning,
          })),
          rules: [],
          parameters: [
            { name: "tenant", type: "integer", required: true, meaning: "Tenant sintético" },
          ],
          sharedKnowledge: {
            catalogId,
            publicationId,
            evidenceId: c.inspection.id,
            ...(old ? { profilePublicationId: profilePublication.publicationId } : {}),
          },
        },
      },
      201,
    );
    const publication = await c.publish(draft.skill.id);
    return { skillId: draft.skill.id, capabilities: publication.capabilities, effects: ["select"] };
  };
  const old = await makeSkill(firstVersion, true);
  await post(
    `${root}/editar`,
    {
      expectedRevision: 1,
      name: "Estrutura OAuth seguinte",
      content: { ...content, label: "2.0" },
    },
    200,
  );
  const next = await makeSkill(await publishPattern(), false);
  return { oldSkill: old.skillId, newSkill: next.skillId, originator: await c.issue([old, next]) };
}
