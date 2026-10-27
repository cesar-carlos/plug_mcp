import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
  CatalogPublication,
  PublishedPackage,
  SkillDraft,
} from "../../../src/domain/persona-v2/catalog";
import {
  federationTrainingSchema,
  type FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import { emptyFederation } from "./federation-editor";

export function useFederationSkillDraft(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  root: ComputedRef<string>;
  drafts: Ref<SkillDraft[]>;
  message: Ref<string>;
  error: Ref<string>;
  loadList: () => Promise<void>;
  loadTests: () => Promise<void>;
  onChanged: () => void;
  onResetDependents: () => void;
  caseBlocked: () => boolean;
}): {
  selected: Ref<string>;
  revision: Ref<number>;
  name: Ref<string>;
  slug: Ref<string>;
  training: Ref<FederationTraining>;
  active: Ref<CatalogPublication<PublishedPackage> | null>;
  advanced: Ref<string>;
  advancedOpen: Ref<boolean>;
  fingerprint: ComputedRef<string>;
  draftDirty: ComputedRef<boolean>;
  load: (id: string) => Promise<void>;
  save: () => Promise<void>;
  applyAdvanced: () => void;
} {
  const selected = ref("");
  const revision = ref(0);
  const name = ref("");
  const slug = ref("");
  const training = ref(emptyFederation());
  const saved = ref("");
  const active = ref<CatalogPublication<PublishedPackage> | null>(null);
  const advanced = ref("");
  const advancedOpen = ref(false);
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
      ? (JSON.parse(JSON.stringify(draft.training)) as FederationTraining)
      : emptyFederation();
    saved.value = fingerprint.value;
    active.value = null;
    advancedOpen.value = false;
    input.onResetDependents();
    if (id) {
      await input.loadTests();
      if (!input.isLive()) {
        return;
      }
      const result = await input.api<{ publication: CatalogPublication<PublishedPackage> | null }>(
        `${input.root.value}/${id}/publicacao`,
      );
      if (input.isLive()) {
        active.value = result.publication;
      }
    }
  }
  async function save(): Promise<void> {
    if (input.caseBlocked() || advancedOpen.value) {
      return;
    }
    await input.run(async () => {
      const parsed = federationTrainingSchema.safeParse(training.value);
      if (!parsed.success) {
        throw new Error(
          "Revise finalidade, regras de combinação, dependências, colunas e etapas do cruzamento.",
        );
      }
      const result = selected.value
        ? await input.api<{ skill: SkillDraft }>(`${input.root.value}/${selected.value}/rascunho`, {
            name: name.value,
            training: parsed.data,
            expectedRevision: revision.value,
          })
        : await input.api<{ skill: SkillDraft }>(input.root.value, {
            name: name.value,
            slug: slug.value,
            kind: "cruzamento",
            training: parsed.data,
          });
      if (!input.isLive()) {
        return;
      }
      selected.value = result.skill.id;
      revision.value = result.skill.revision;
      saved.value = fingerprint.value;
      await input.loadList();
      await input.loadTests();
      if (input.isLive()) {
        input.onChanged();
        input.message.value = "Rascunho de cruzamento salvo. Publicação e permissões preservadas.";
      }
    });
  }
  function applyAdvanced(): void {
    try {
      training.value = federationTrainingSchema.parse(JSON.parse(advanced.value));
      advancedOpen.value = false;
    } catch {
      input.error.value = "JSON inválido. Preserve o contrato tipado de cruzamento.";
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
    fingerprint,
    draftDirty,
    load,
    save,
    applyAdvanced,
  };
}
