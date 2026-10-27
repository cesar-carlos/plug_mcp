import type { GrantPublication } from "./model";
import { publicationEffectsLabel, publicationExternalOperations } from "./publication-grant";

export interface TokenLabeledOption {
  readonly id: string;
  readonly label: string;
}

export interface TokenPublishedSkillOption extends TokenLabeledOption {
  readonly checked: boolean;
  readonly disabled: boolean;
}

export function tokenExternalOperationOptions(
  publications: Readonly<Record<string, GrantPublication | undefined>>,
  currentIds: readonly string[],
): TokenLabeledOption[] {
  const labels = new Map<string, string>();
  for (const publication of Object.values(publications)) {
    if (!publication) {
      continue;
    }
    try {
      for (const id of publicationExternalOperations(publication)) {
        labels.set(id, `${publication.package.name} · revisão ${publication.revision}`);
      }
    } catch {
      // Invalid publications cannot add a grant; existing IDs remain removable.
    }
  }
  for (const id of currentIds) {
    if (!labels.has(id)) {
      labels.set(id, `Operação sem publicação disponível (${id})`);
    }
  }
  return [...labels].map(([id, label]) => ({ id, label }));
}

export function tokenPublishedSkillOptions(
  publications: Readonly<Record<string, GrantPublication | undefined>>,
  grantedSkillIds: readonly string[],
): TokenPublishedSkillOption[] {
  const granted = new Set(grantedSkillIds);
  return Object.entries(publications).flatMap(([id, publication]) => {
    if (!publication) {
      return [];
    }
    const alreadyGranted = granted.has(id);
    return [
      {
        id,
        label: `${publication.package.name} · revisão ${publication.revision} · ${publicationEffectsLabel(publication)}`,
        checked: alreadyGranted,
        disabled: !!publication.suspendedAt || alreadyGranted,
      },
    ];
  });
}
