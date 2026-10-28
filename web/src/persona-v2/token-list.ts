import type { GrantPublication, Source } from "./model";
import { fieldCapabilityLabel, fieldUseCapabilities } from "./field-capabilities";

export function groupedFieldLabels(capabilities: readonly string[]): string[] {
  const groups = new Map<string, { field: string; source: string; uses: Set<string> }>();
  const fieldSources = new Map<string, Set<string>>();
  const unrecognized: string[] = [];
  for (const capability of fieldUseCapabilities(capabilities)) {
    const parts = capability.split(":");
    if (parts.length !== 4 || !parts[1] || !parts[2] || !parts[3]) {
      unrecognized.push(capability);
      continue;
    }
    const key = JSON.stringify([parts[1], parts[2]]);
    const group = groups.get(key) ?? { source: parts[1], field: parts[2], uses: new Set<string>() };
    group.uses.add(fieldCapabilityLabel(capability).slice(parts[2].length + 3));
    groups.set(key, group);
    const sources = fieldSources.get(group.field) ?? new Set<string>();
    sources.add(group.source);
    fieldSources.set(group.field, sources);
  }
  return [...groups.values()]
    .map((group) => {
      const ambiguous = (fieldSources.get(group.field)?.size ?? 0) > 1;
      return `${group.field}${ambiguous ? ` (${group.source})` : ""} · ${[...group.uses].join(" · ")}`;
    })
    .concat(unrecognized);
}

export function tokenSourceGroup(
  publication: GrantPublication | undefined,
  sources: readonly Source[],
): { key: string; label: string } {
  if (!publication) return { key: "missing", label: "Publicação indisponível" };
  if (publication.package.format === "persona-external-v2")
    return { key: "external", label: "Integrações externas" };
  if (publication.package.format === "persona-federation-v2")
    return { key: "federation", label: "Cruzamentos entre bases" };
  const id = publication.package.sourceId;
  return id
    ? {
        key: `source:${id}`,
        label: sources.find((source) => source.id === id)?.name ?? `Base não disponível (${id})`,
      }
    : { key: "unspecified", label: "Sem base informada" };
}
