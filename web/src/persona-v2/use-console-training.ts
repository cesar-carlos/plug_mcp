import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { matchesSearch } from "./list-search";
import type { PersonaLoadedData } from "./console-persona-data";
import { emptyTraining, type Draft, type Preview, type Source, type Training } from "./model";
import type { ConsoleArea } from "./navigation";
import { publicationDeadline } from "./publication-deadline";
import { duplicateSqlExamples } from "./training-visual";

export function useConsoleTraining(
  drafts: Ref<Draft[]>,
  sources: Ref<Source[]>,
  personaId: Ref<string>,
  api: <T>(url: string, body?: unknown) => Promise<T>,
  run: (action: () => Promise<void>) => Promise<void>,
  confirmDiscard: () => Promise<boolean>,
  load: () => Promise<void>,
  readPersonaData: (id: string) => Promise<PersonaLoadedData>,
  applyPersonaData: (id: string, data: PersonaLoadedData) => void,
  path: () => string,
  message: Ref<string>,
  area: ComputedRef<ConsoleArea> | Ref<ConsoleArea>,
  busy: Ref<boolean>,
  dialogOpen: Ref<boolean>,
): {
  training: Ref<Training>;
  name: Ref<string>;
  slug: Ref<string>;
  draftId: Ref<string>;
  revision: Ref<number>;
  preview: Ref<Preview | undefined>;
  confirmed: Ref<boolean>;
  reviewDate: Ref<string>;
  skillSearch: Ref<string>;
  queryDrafts: ComputedRef<Draft[]>;
  matchingDrafts: ComputedRef<Draft[]>;
  duplicateExamples: ComputedRef<readonly [string, string][]>;
  dirty: ComputedRef<boolean>;
  queryCaseDirty: Ref<boolean>;
  queryTestsKey: Ref<number>;
  externalSkillDirty: Ref<boolean>;
  externalSkillKey: Ref<number>;
  federationSkillDirty: Ref<boolean>;
  federationSkillKey: Ref<number>;
  operationSkillDirty: Ref<boolean>;
  operationSkillKey: Ref<number>;
  trainingKnowledgeDirty: Ref<boolean>;
  trainingKnowledgeKey: Ref<number>;
  mountedTrainingPanels: Ref<Set<string>>;
  importedPanelsReady: ComputedRef<boolean>;
  resetTraining: () => void;
  editDraft: (event: Event) => Promise<void>;
  reloadTraining: () => Promise<void>;
  selectDraft: (draft?: Draft) => void;
  changeTrainingSource: (event: Event) => Promise<void>;
  saveTraining: () => Promise<void>;
  previewTraining: () => Promise<void>;
  publishTraining: () => Promise<void>;
  onTrainingRevisionSaved: (nextRevision: number) => void;
} {
  const training = ref(emptyTraining());
  const name = ref("");
  const slug = ref("");
  const draftId = ref("");
  const saved = ref(JSON.stringify({ name: "", slug: "", training: emptyTraining() }));
  const revision = ref(0);
  const preview = ref<Preview>();
  const confirmed = ref(false);
  const reviewDate = ref("");
  const skillSearch = ref("");
  const queryCaseDirty = ref(false);
  const queryTestsKey = ref(0);
  const externalSkillDirty = ref(false);
  const externalSkillKey = ref(0);
  const federationSkillDirty = ref(false);
  const federationSkillKey = ref(0);
  const operationSkillDirty = ref(false);
  const operationSkillKey = ref(0);
  const trainingKnowledgeDirty = ref(false);
  const trainingKnowledgeKey = ref(0);
  const mountedTrainingPanels = ref(new Set<string>());
  const fingerprint = computed(() =>
    JSON.stringify({ name: name.value, slug: slug.value, training: training.value }),
  );
  const dirty = computed(() => fingerprint.value !== saved.value);
  const queryDrafts = computed(() => drafts.value.filter((draft) => draft.kind === "consulta"));
  const matchingDrafts = computed(() =>
    queryDrafts.value.filter((draft) => matchesSearch(skillSearch.value, draft.name)),
  );
  const duplicateExamples = computed(() =>
    duplicateSqlExamples([
      { id: "modelo-principal", dialect: training.value.dialect, sql: training.value.sqlModel },
      ...(training.value.examples ?? []).map((example) => ({
        ...example,
        dialect: training.value.dialect,
      })),
    ]),
  );
  const importedPanelsReady = computed(() =>
    ["operation", "external", "federation", "knowledge", "cases"].every((panel) =>
      mountedTrainingPanels.value.has(panel),
    ),
  );

  watch(
    [area, personaId],
    () => {
      mountedTrainingPanels.value = new Set();
    },
    { flush: "sync" },
  );
  watch(reviewDate, () => {
    preview.value = undefined;
    confirmed.value = false;
  });
  watch(fingerprint, () => {
    preview.value = undefined;
    confirmed.value = false;
  });
  watch(
    () => training.value.sourceId,
    (id) => {
      const source = sources.value.find((item) => item.id === id);
      if (source) {
        training.value.dialect = source.dialect;
      }
    },
  );

  function resetTraining(): void {
    queryCaseDirty.value = false;
    queryTestsKey.value++;
    externalSkillDirty.value = false;
    externalSkillKey.value++;
    federationSkillDirty.value = false;
    federationSkillKey.value++;
    operationSkillDirty.value = false;
    operationSkillKey.value++;
    reviewDate.value = "";
    trainingKnowledgeDirty.value = false;
    trainingKnowledgeKey.value++;
    training.value = emptyTraining();
    name.value = "";
    slug.value = "";
    draftId.value = "";
    revision.value = 0;
    saved.value = fingerprint.value;
    preview.value = undefined;
    confirmed.value = false;
  }

  function selectDraft(draft?: Draft): void {
    resetTraining();
    if (draft) {
      training.value = JSON.parse(JSON.stringify(draft.training)) as Training;
      name.value = draft.name;
      slug.value = draft.slug;
      draftId.value = draft.id;
      revision.value = draft.revision;
      saved.value = fingerprint.value;
    }
  }

  async function editDraft(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    if (
      (dirty.value || queryCaseDirty.value || trainingKnowledgeDirty.value || !!reviewDate.value) &&
      !(await confirmDiscard())
    ) {
      (event.target as HTMLSelectElement).value = draftId.value;
      return;
    }
    const draft = drafts.value.find((item) => item.id === id);
    selectDraft(draft);
  }

  async function reloadTraining(): Promise<void> {
    if (!draftId.value || busy.value || dialogOpen.value) {
      return;
    }
    const ownerId = personaId.value;
    const selectedId = draftId.value;
    if (
      (dirty.value || queryCaseDirty.value || trainingKnowledgeDirty.value || !!reviewDate.value) &&
      !(await confirmDiscard())
    ) {
      return;
    }
    await run(async () => {
      const data = await readPersonaData(ownerId);
      if (personaId.value !== ownerId || draftId.value !== selectedId) {
        return;
      }
      const draft = data.drafts.find((item) => item.id === selectedId && item.kind === "consulta");
      if (!draft) {
        throw new Error("Treinamento indisponível. A edição local foi preservada.");
      }
      applyPersonaData(ownerId, data);
      selectDraft(draft);
      message.value = "Treinamento recarregado do servidor. Revise antes de salvar ou publicar.";
    });
  }

  async function changeTrainingSource(event: Event): Promise<void> {
    const input = event.target as HTMLSelectElement;
    const nextSource = input.value;
    const currentTraining = training.value;
    const currentPersona = personaId.value;
    input.value = currentTraining.sourceId;
    if (nextSource === currentTraining.sourceId) {
      return;
    }
    if (
      (trainingKnowledgeDirty.value || currentTraining.sharedKnowledge) &&
      !(await confirmDiscard())
    ) {
      return;
    }
    if (
      busy.value ||
      personaId.value !== currentPersona ||
      training.value !== currentTraining ||
      !sources.value.some((source) => source.id === nextSource && source.active)
    ) {
      return;
    }
    delete currentTraining.sharedKnowledge;
    trainingKnowledgeDirty.value = false;
    trainingKnowledgeKey.value++;
    currentTraining.sourceId = nextSource;
  }

  async function saveTraining(): Promise<void> {
    await run(async () => {
      const response = draftId.value
        ? await api<{ skill: Draft }>(`${path()}/skills/${draftId.value}/rascunho`, {
            name: name.value,
            training: training.value,
            expectedRevision: revision.value,
          })
        : await api<{ skill: Draft }>(`${path()}/skills`, {
            name: name.value,
            slug: slug.value,
            kind: "consulta",
            training: training.value,
          });
      draftId.value = response.skill.id;
      revision.value = response.skill.revision;
      saved.value = fingerprint.value;
      await load();
      message.value = "Rascunho salvo. Revise o pacote antes de publicar.";
    });
  }

  async function previewTraining(): Promise<void> {
    await run(async () => {
      preview.value = await api<Preview>(`${path()}/skills/${draftId.value}/preview`, {
        reviewDueAt: publicationDeadline(reviewDate.value),
      });
      confirmed.value = false;
    });
  }

  async function publishTraining(): Promise<void> {
    await run(async () => {
      if (
        !preview.value ||
        !confirmed.value ||
        dirty.value ||
        Date.parse(preview.value.expiresAt) <= Date.now()
      ) {
        throw new Error("Revise um preview atual antes de publicar.");
      }
      await api(`${path()}/skills/${draftId.value}/publicar`, {
        confirmationHash: preview.value.confirmationHash,
      });
      reviewDate.value = "";
      preview.value = undefined;
      confirmed.value = false;
      await load();
      message.value = "Treinamento publicado. Libere seu uso em um token.";
    });
  }

  function onTrainingRevisionSaved(nextRevision: number): void {
    revision.value = nextRevision;
    preview.value = undefined;
    confirmed.value = false;
    drafts.value = drafts.value.map((draft) =>
      draft.id === draftId.value ? { ...draft, revision: nextRevision } : draft,
    );
  }

  return {
    training,
    name,
    slug,
    draftId,
    revision,
    preview,
    confirmed,
    reviewDate,
    skillSearch,
    queryDrafts,
    matchingDrafts,
    duplicateExamples,
    dirty,
    queryCaseDirty,
    queryTestsKey,
    externalSkillDirty,
    externalSkillKey,
    federationSkillDirty,
    federationSkillKey,
    operationSkillDirty,
    operationSkillKey,
    trainingKnowledgeDirty,
    trainingKnowledgeKey,
    mountedTrainingPanels,
    importedPanelsReady,
    resetTraining,
    editDraft,
    reloadTraining,
    selectDraft,
    changeTrainingSource,
    saveTraining,
    previewTraining,
    publishTraining,
    onTrainingRevisionSaved,
  };
}
