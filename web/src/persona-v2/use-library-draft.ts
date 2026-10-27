import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  buildLibraryDraftRequest,
  libraryAdditionalExamples,
  parseCreatedLibraryDraft,
  type LibraryItem,
  type LibrarySource,
} from "./library-panel";
import type { ImportedDraftReference } from "./model";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";

export function useLibraryDraft(input: {
  catalogId: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  selected: Ref<LibraryItem | undefined>;
  datasets: ComputedRef<LibraryItem[]>;
  template: ComputedRef<StructureContent | undefined>;
  message: Ref<string>;
}): {
  createdDraft: Ref<ImportedDraftReference | undefined>;
  personas: Ref<{ id: string; name: string }[]>;
  personaId: Ref<string>;
  sources: Ref<LibrarySource[]>;
  sourceId: Ref<string>;
  chosenDialect: Ref<string>;
  exampleId: Ref<string>;
  additionalExampleIds: Ref<string[]>;
  datasetId: Ref<string>;
  skillSlug: Ref<string>;
  skillName: Ref<string>;
  additionalExamples: ComputedRef<StructureContent["examples"]>;
  clearDestination: () => void;
  loadPersonas: () => Promise<void>;
  loadSources: () => Promise<void>;
  apply: () => Promise<void>;
} {
  const createdDraft = ref<ImportedDraftReference>();
  const personas = ref<{ id: string; name: string }[]>([]);
  const personaId = ref("");
  const sources = ref<LibrarySource[]>([]);
  const sourceId = ref("");
  const chosenDialect = ref("");
  const exampleId = ref("");
  const additionalExampleIds = ref<string[]>([]);
  const datasetId = ref("");
  const skillSlug = ref("");
  const skillName = ref("");
  const additionalExamples = computed(() =>
    libraryAdditionalExamples(input.template.value, exampleId.value, chosenDialect.value),
  );
  watch([exampleId, chosenDialect], () => {
    additionalExampleIds.value = [];
  });
  function clearDestination(): void {
    personaId.value = "";
    sources.value = [];
    sourceId.value = "";
    chosenDialect.value = "";
    exampleId.value = "";
    additionalExampleIds.value = [];
    datasetId.value = "";
    skillSlug.value = "";
    skillName.value = "";
  }
  async function loadPersonas(): Promise<void> {
    await input.run(async () => {
      const data = await input.api<{ personas: { id: string; name: string }[] }>(
        "/api/admin/personas",
      );
      if (input.isLive()) {
        personas.value = data.personas;
      }
    });
  }
  async function loadSources(): Promise<void> {
    sources.value = [];
    sourceId.value = "";
    await input.run(async () => {
      const data = await input.api<{ fontes: LibrarySource[] }>(
        `/api/admin/personas/${personaId.value}/fontes`,
      );
      if (input.isLive()) {
        sources.value = data.fontes;
      }
    });
  }
  async function apply(): Promise<void> {
    await input.run(async () => {
      const item = input.selected.value;
      const source = sources.value.find((entry) => entry.id === sourceId.value);
      if (!item || !source) {
        throw new Error("Selecione template, persona e base.");
      }
      const dataSet = datasetId.value
        ? input.datasets.value.find((entry) => entry.id === datasetId.value)
        : undefined;
      if (datasetId.value && !dataSet) {
        throw new Error("Recarregue o dataset autorizado.");
      }
      const destinationPersona = personaId.value;
      createdDraft.value = undefined;
      const raw = await input.api<unknown>(
        `/api/admin/personas/${personaId.value}/skills/template`,
        buildLibraryDraftRequest({
          catalogId: input.catalogId,
          item,
          source,
          dialect: chosenDialect.value,
          exampleId: exampleId.value,
          additionalExampleIds: additionalExampleIds.value,
          dataset: dataSet,
          slug: skillSlug.value,
          name: skillName.value,
        }),
      );
      if (input.isLive()) {
        createdDraft.value = parseCreatedLibraryDraft(raw, destinationPersona);
        clearDestination();
        input.message.value = `Rascunho ${createdDraft.value.name} criado. Revise candidatos, inspecione a base e execute os casos antes de publicar.`;
      }
    });
  }
  return {
    createdDraft,
    personas,
    personaId,
    sources,
    sourceId,
    chosenDialect,
    exampleId,
    additionalExampleIds,
    datasetId,
    skillSlug,
    skillName,
    additionalExamples,
    clearDestination,
    loadPersonas,
    loadSources,
    apply,
  };
}
