import { computed, ref, type ComputedRef, type Ref } from "vue";
import { standardPublicationSchema } from "./knowledge-model";
import type { Content } from "./knowledge-model";
import type { ProfilePublication } from "./knowledge-model";
import {
  buildCurationProposalBody,
  curationStructuralItems,
  emptyCurationExample,
  type CurationExample,
  type CurationProposalKind,
} from "./curation-proposal";

export function useCurationProposal(input: {
  catalogId: string;
  physical?: { sourceBase: string; publication: ProfilePublication };
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  disabled: () => boolean;
  busy: Ref<boolean>;
  confirmDiscard: () => Promise<boolean>;
  root: () => string;
  refresh: () => Promise<void>;
  message: Ref<string>;
}): {
  baseId: Ref<string>;
  summary: Ref<string>;
  kind: Ref<CurationProposalKind>;
  rule: Ref<string>;
  example: Ref<CurationExample>;
  proposalContent: Ref<Content | undefined>;
  loadedBaseId: Ref<string>;
  targetId: Ref<string>;
  overrideCommon: Ref<boolean>;
  structuralItems: ComputedRef<Content["tables"] | Content["relationships"]>;
  dirty: ComputedRef<boolean>;
  propose: () => Promise<void>;
  loadStructure: () => Promise<void>;
} {
  const baseId = ref(input.physical?.publication.publicationId ?? "");
  const summary = ref("");
  const kind = ref<CurationProposalKind>("regra");
  const rule = ref("");
  const proposalContent = ref<Content>();
  const loadedBaseId = ref("");
  const originalContent = ref("");
  const targetId = ref("");
  const example = ref(emptyCurationExample());
  const overrideCommon = ref(false);
  const structuralItems = computed(() =>
    curationStructuralItems(kind.value, proposalContent.value),
  );
  const fingerprint = computed(() =>
    JSON.stringify([
      baseId.value,
      summary.value,
      kind.value,
      rule.value,
      example.value,
      proposalContent.value,
      targetId.value,
      overrideCommon.value,
    ]),
  );
  const saved = ref(fingerprint.value);
  const dirty = computed(() => fingerprint.value !== saved.value);
  async function propose(): Promise<void> {
    await input.run(async () => {
      if (
        (kind.value === "tabela" || kind.value === "relacionamento") &&
        loadedBaseId.value !== baseId.value
      ) {
        throw new Error("Carregue a versão base selecionada antes de propor estrutura.");
      }
      const body = buildCurationProposalBody({
        summary: summary.value,
        kind: kind.value,
        rule: rule.value,
        example: example.value,
        structuralItems: structuralItems.value,
        targetId: targetId.value,
        baseId: baseId.value,
        physical: !!input.physical,
        overrideCommon: overrideCommon.value,
      });
      await input.api(input.root(), body);
      if (!input.isLive()) {
        return;
      }
      summary.value = "";
      rule.value = "";
      proposalContent.value = undefined;
      loadedBaseId.value = "";
      originalContent.value = "";
      targetId.value = "";
      overrideCommon.value = false;
      example.value = emptyCurationExample();
      saved.value = fingerprint.value;
      await input.refresh();
      input.message.value = "Proposta enviada. Ela não altera rascunho, publicação ou permissões.";
    });
  }
  async function loadStructure(): Promise<void> {
    if (!baseId.value || input.busy.value || input.disabled()) {
      return;
    }
    if (
      proposalContent.value &&
      JSON.stringify(proposalContent.value) !== originalContent.value &&
      !(await input.confirmDiscard())
    ) {
      return;
    }
    const base = baseId.value;
    await input.run(async () => {
      const result = input.physical
        ? null
        : await input.api<{ publication: unknown }>(
            `/api/admin/catalogos/${input.catalogId}/publicacoes/${base}`,
          );
      if (!input.isLive() || baseId.value !== base) {
        return;
      }
      const publication = input.physical
        ? {
            id: input.physical.publication.publicationId,
            content: input.physical.publication.content,
            suspendedAt: input.physical.publication.suspended ? "suspended" : null,
          }
        : standardPublicationSchema.parse(result!.publication);
      if (publication.id !== base || publication.suspendedAt) {
        throw new Error("Versão base indisponível.");
      }
      proposalContent.value = JSON.parse(JSON.stringify(publication.content)) as Content;
      loadedBaseId.value = base;
      originalContent.value = JSON.stringify(publication.content);
      targetId.value = "";
      input.message.value =
        "Estrutura publicada carregada para proposta. Somente o item selecionado será enviado.";
    });
  }
  return {
    baseId,
    summary,
    kind,
    rule,
    example,
    proposalContent,
    loadedBaseId,
    targetId,
    overrideCommon,
    structuralItems,
    dirty,
    propose,
    loadStructure,
  };
}
