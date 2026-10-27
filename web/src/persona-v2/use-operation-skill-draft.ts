import { computed, ref, type ComputedRef, type Ref, type WritableComputedRef } from "vue";
import type { SkillDraft } from "../../../src/domain/persona-v2/catalog";
import { operationTrainingSchema } from "../../../src/domain/persona-v2/operation-training";
import type { Source } from "./model";
import {
  emptyOperation,
  operationSourceAssignment,
  type OperationTraining,
} from "./operation-editor";

export type OperationPublication = {
  id: string;
  revision: number;
  package: { name: string };
  hash: string;
};

export function useOperationSkillDraft(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  root: ComputedRef<string>;
  drafts: Ref<SkillDraft[]>;
  sources: () => Source[];
  message: Ref<string>;
  error: Ref<string>;
  loadList: () => Promise<void>;
  loadTests: () => Promise<void>;
  onChanged: () => void;
  onResetDependents: () => void;
  caseBlocked: () => boolean;
  knowledgeDirty: Ref<boolean>;
  knowledgeBusy: Ref<boolean>;
  blocked: () => boolean;
  confirmDiscard: () => Promise<boolean>;
  clearPreview: () => void;
}): {
  selected: Ref<string>;
  revision: Ref<number>;
  name: Ref<string>;
  slug: Ref<string>;
  training: Ref<OperationTraining>;
  active: Ref<OperationPublication | null>;
  advanced: Ref<string>;
  advancedOpen: Ref<boolean>;
  knowledgeKey: Ref<number>;
  relationships: WritableComputedRef<NonNullable<OperationTraining["relationships"]>>;
  fingerprint: ComputedRef<string>;
  draftDirty: ComputedRef<boolean>;
  load: (id: string) => Promise<void>;
  save: () => Promise<void>;
  sourceChange: (event: Event) => Promise<void>;
  adoptKnowledge: (value: OperationTraining) => void;
  applyAdvanced: () => void;
} {
  const selected = ref("");
  const revision = ref(0);
  const name = ref("");
  const slug = ref("");
  const training = ref(emptyOperation());
  const saved = ref("");
  const active = ref<OperationPublication | null>(null);
  const advanced = ref("");
  const advancedOpen = ref(false);
  const knowledgeKey = ref(0);
  const relationships = computed({
    get: () => training.value.relationships ?? [],
    set: (value) => {
      training.value.relationships = value;
    },
  });
  const fingerprint = computed(() =>
    JSON.stringify({ name: name.value, slug: slug.value, training: training.value }),
  );
  saved.value = fingerprint.value;
  const draftDirty = computed(() => fingerprint.value !== saved.value);
  async function load(id: string): Promise<void> {
    if (!input.isLive()) {
      return;
    }
    const draft = input.drafts.value.find((item) => item.id === id);
    selected.value = id;
    revision.value = draft?.revision ?? 0;
    name.value = draft?.name ?? "";
    slug.value = draft?.slug ?? "";
    training.value = draft
      ? (JSON.parse(JSON.stringify(draft.training)) as OperationTraining)
      : emptyOperation();
    saved.value = fingerprint.value;
    active.value = null;
    advancedOpen.value = false;
    input.knowledgeDirty.value = false;
    knowledgeKey.value++;
    input.onResetDependents();
    if (id) {
      await input.loadTests();
      if (!input.isLive()) {
        return;
      }
      const result = await input.api<{ publication: typeof active.value }>(
        `${input.root.value}/${id}/publicacao`,
      );
      if (input.isLive()) {
        active.value = result.publication;
      }
    }
  }
  async function sourceChange(event: Event): Promise<void> {
    const element = event.target as HTMLSelectElement;
    const next = element.value;
    element.value = training.value.sourceId;
    if (next === training.value.sourceId) {
      return;
    }
    if (
      (input.knowledgeDirty.value || training.value.sharedKnowledge) &&
      !(await input.confirmDiscard())
    ) {
      return;
    }
    if (!input.isLive() || input.blocked()) {
      return;
    }
    const source = input.sources().find((item) => item.id === next);
    training.value = operationSourceAssignment(training.value, source, next);
    input.knowledgeDirty.value = false;
    knowledgeKey.value++;
  }
  function adoptKnowledge(value: OperationTraining): void {
    training.value = value;
    input.clearPreview();
  }
  async function save(): Promise<void> {
    if (input.caseBlocked() || input.knowledgeDirty.value || advancedOpen.value) {
      input.error.value =
        "Aplique ou descarte a seleção de conhecimento, feche a edição do caso e aplique ou feche o JSON antes de salvar o contrato.";
      return;
    }
    await input.run(async () => {
      const result = selected.value
        ? await input.api<{ skill: SkillDraft }>(`${input.root.value}/${selected.value}/rascunho`, {
            name: name.value,
            training: training.value,
            expectedRevision: revision.value,
          })
        : await input.api<{ skill: SkillDraft }>(input.root.value, {
            name: name.value,
            slug: slug.value,
            kind: "operacao_sql",
            training: training.value,
          });
      if (!input.isLive()) {
        return;
      }
      selected.value = result.skill.id;
      revision.value = result.skill.revision;
      saved.value = fingerprint.value;
      await input.loadList();
      await input.loadTests();
      if (!input.isLive()) {
        return;
      }
      input.onChanged();
      input.message.value =
        "Rascunho salvo. A publicação ativa e as permissões não foram alteradas.";
    });
  }
  function applyAdvanced(): void {
    try {
      training.value = operationTrainingSchema.parse(JSON.parse(advanced.value));
      advancedOpen.value = false;
      input.knowledgeDirty.value = false;
      knowledgeKey.value++;
    } catch {
      input.error.value = "JSON inválido. Preserve a estrutura do contrato de operação.";
    }
  }
  return {
    selected,
    revision,
    name,
    slug,
    training,
    active,
    advanced,
    advancedOpen,
    knowledgeKey,
    relationships,
    fingerprint,
    draftDirty,
    load,
    save,
    sourceChange,
    adoptKnowledge,
    applyAdvanced,
  };
}
