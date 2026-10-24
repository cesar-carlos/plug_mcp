import type { SourceQueryLease } from "../../domain/ports/source-query.port.js";
import type { ExpectedStructure } from "../../domain/persona-v2/source-schema.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** Fixed metadata only. Compare dependencies, never require unrelated columns/constraints. */
export async function verifyAttachmentStructure(
  lease: SourceQueryLease,
  expected: ExpectedStructure | undefined,
  mismatch: () => Promise<void>,
  deadline: () => void,
): Promise<void> {
  if (!expected) {
    return;
  }
  if (!lease.inspectSchema) {
    throw new PersonaV2Error(
      "CAPABILITY_UNAVAILABLE",
      "Inspeção vigente indisponível para o anexo.",
    );
  }
  for (let offset = 0; offset < expected.resources.length; offset += 4) {
    deadline();
    const resources = expected.resources.slice(offset, offset + 4);
    const page = await lease.inspectSchema({
      resources: resources.map((r) => r.resource),
      offset: 0,
      pageSize: resources.length,
    });
    deadline();
    if (
      page.metadataPage.offset !== 0 ||
      page.metadataPage.nextOffset !== null ||
      page.metadataPage.pageSize !== resources.length ||
      page.resources.length !== resources.length ||
      new Set(page.resources.map((r) => canonicalJson(r.resource))).size !== resources.length
    ) {
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Prova estrutural incompleta para o anexo.",
      );
    }
    for (const resource of resources) {
      const observed = page.resources.find(
        (r) => canonicalJson(r.resource) === canonicalJson(resource.resource),
      );
      if (observed?.status !== "available" || !observed.coverage.columns) {
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Metadados indisponíveis; anexo não pode ser entregue.",
        );
      }
      let incompatible = resource.columns.some((column) => {
        const actual = observed.columns.find((c) => c.name === column.name);
        if (actual?.nullable === null && column.nullable !== null) {
          throw new PersonaV2Error(
            "CAPABILITY_UNAVAILABLE",
            "Nulabilidade não comprovada para o anexo.",
          );
        }
        return (
          !actual || canonicalJson({ ...actual, ordinal: undefined }) !== canonicalJson(column)
        );
      });
      if (resource.constraints) {
        for (const kind of ["primaryKeys", "uniqueKeys", "foreignKeys"] as const) {
          const required = resource.constraints[kind];
          if (!required.length) {
            continue;
          }
          if (!observed.coverage[kind] || !observed.coverage.constraintStatus) {
            throw new PersonaV2Error(
              "CAPABILITY_UNAVAILABLE",
              "Constraints não comprovadas para o anexo.",
            );
          }
          for (const key of required) {
            const actual = observed[kind]?.find((k) => k.name === key.name);
            if (actual?.status === "unknown") {
              throw new PersonaV2Error(
                "CAPABILITY_UNAVAILABLE",
                "Constraint desconhecida; entrega bloqueada.",
              );
            }
            incompatible ||= !actual || canonicalJson(actual) !== canonicalJson(key);
          }
        }
      }
      if (incompatible) {
        await mismatch();
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Estrutura alterada; publicações utilizadas foram suspensas e o anexo recusado.",
        );
      }
    }
  }
}
