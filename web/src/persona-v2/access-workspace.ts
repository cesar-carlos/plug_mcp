import type { GrantPublication } from "./model";
import type { UncertainIssuance } from "./token-permissions";

export const ACCESS_TOKEN_TABS = ["list", "new", "connect", "chatgpt", "connections"] as const;

export type AccessTokenTab = (typeof ACCESS_TOKEN_TABS)[number];

export const ACCESS_TOKEN_TAB_SECTIONS: Record<AccessTokenTab, string> = {
  list: "access-token-list",
  new: "access-new-token",
  connect: "access-connect",
  chatgpt: "access-chatgpt",
  connections: "access-connections",
};

export const BEARER_REVEAL_MS = 30_000;

export interface ChosenIssuanceSkill {
  id: string;
  publication: GrantPublication;
}

export function chosenIssuanceSkills(
  selectedSkillIds: readonly string[],
  publications: Readonly<Record<string, GrantPublication | undefined>>,
): ChosenIssuanceSkill[] {
  return selectedSkillIds.flatMap((id) => {
    const publication = publications[id];
    return publication ? [{ id, publication }] : [];
  });
}

export function assertIssuanceSelection(
  chosen: readonly ChosenIssuanceSkill[],
  administrative: readonly string[],
): void {
  if (!chosen.length && !administrative.length) {
    throw new Error("Selecione pelo menos uma capacidade publicada.");
  }
  for (const { publication } of chosen) {
    for (const dependency of publication.package.dependencies ?? []) {
      if (
        !chosen.some(
          (item) =>
            item.id === dependency.skillId &&
            item.publication.id === dependency.publicationId &&
            item.publication.hash === dependency.hash,
        )
      ) {
        throw new Error(
          "Selecione explicitamente todas as consultas dependentes do cruzamento, nas versões publicadas exigidas.",
        );
      }
    }
  }
}

export function issuanceExpiresAt(noExpiry: boolean, days: number, now: number): string | null {
  return noExpiry ? null : new Date(now + days * 86400000).toISOString();
}

export function markUncertainIssuance(
  current: Readonly<Record<string, UncertainIssuance>>,
  personaId: string,
): Record<string, UncertainIssuance> {
  return {
    ...current,
    [personaId]: { checked: false, tokens: [] },
  };
}

export function clearUncertainIssuance(
  current: Readonly<Record<string, UncertainIssuance>>,
  personaId: string,
): Record<string, UncertainIssuance> {
  const next = { ...current };
  delete next[personaId];
  return next;
}

export function listedIssuanceTokens(
  tokens: readonly { id: string; name: string; revokedAt: string | null }[],
): { id: string; name: string; revokedAt: string | null }[] {
  return tokens.map(({ id, name, revokedAt }) => ({ id, name, revokedAt }));
}
