import { computed, reactive, ref, type ComputedRef, type Ref } from "vue";
import { useRouter } from "vue-router";
import { readPersonaData as loadPersonaData, type PersonaLoadedData } from "./console-persona-data";
import { matchesSearch } from "./list-search";
import type {
  Draft,
  GrantPublication,
  ImportedDraftReference,
  Persona,
  Publication,
  Source,
} from "./model";
import type { ConsoleArea } from "./navigation";

export type { PersonaLoadedData };

export interface ConsolePersonaHooks {
  syncQueryPublications: (publications: Record<string, Publication>) => void;
  resetWorkspace: () => void;
  selectDraft: (draft?: Draft) => void;
  clearDependentEditors: () => void;
  currentDraftId: () => string;
}

export function useConsolePersona(
  api: <T>(url: string, body?: unknown) => Promise<T>,
  run: (action: () => Promise<void>, form?: string) => Promise<void>,
  confirmDiscard: () => Promise<boolean>,
  personaDirty: () => boolean,
  anyDirty: () => boolean,
  discardArea: (area: ConsoleArea) => void,
  requests: { reset: () => void },
  message: Ref<string>,
  error: Ref<string>,
  logged: Ref<boolean>,
  area: ComputedRef<ConsoleArea> | Ref<ConsoleArea>,
  settingsDirty: Ref<boolean>,
  hooks: ConsolePersonaHooks,
): {
  personas: Ref<Persona[]>;
  personaId: Ref<string>;
  loadedPersonaId: Ref<string>;
  personaForm: { name: string; specialty: string; instructions: string };
  personaIconFile: Ref<File | undefined>;
  personaSearch: Ref<string>;
  matchingPersonas: ComputedRef<Persona[]>;
  sources: Ref<Source[]>;
  drafts: Ref<Draft[]>;
  publications: Ref<Record<string, Publication>>;
  additionalPublications: Ref<Record<string, GrantPublication>>;
  tokenPublications: ComputedRef<Record<string, GrantPublication>>;
  persona: ComputedRef<Persona | undefined>;
  personaOpen: Ref<boolean>;
  newPersonaDirty: ComputedRef<boolean>;
  importedDraftFocus: Ref<Pick<ImportedDraftReference, "personaId" | "skillId"> | undefined>;
  path: () => string;
  readPersonaData: (id: string) => Promise<PersonaLoadedData>;
  applyPersonaData: (id: string, data: PersonaLoadedData) => void;
  load: () => Promise<void>;
  choosePersona: (event: Event) => Promise<void>;
  createPersona: () => Promise<void>;
  savePersona: (input: unknown) => Promise<void>;
  changePersonaState: (active: boolean) => Promise<void>;
  openImportedDraft: (reference: ImportedDraftReference) => Promise<void>;
  clearPersona: () => void;
} {
  const router = useRouter();
  const personas = ref<Persona[]>([]);
  const personaId = ref("");
  const loadedPersonaId = ref("");
  const personaForm = reactive({ name: "", specialty: "", instructions: "" });
  const personaOpen = ref(false);
  const personaIconFile = ref<File>();
  const personaSearch = ref("");
  const sources = ref<Source[]>([]);
  const drafts = ref<Draft[]>([]);
  const publications = ref<Record<string, Publication>>({});
  const additionalPublications = ref<Record<string, GrantPublication>>({});
  const importedDraftFocus = ref<Pick<ImportedDraftReference, "personaId" | "skillId">>();
  const matchingPersonas = computed(() =>
    personas.value.filter((item) => matchesSearch(personaSearch.value, item.name, item.specialty)),
  );
  const newPersonaDirty = computed(
    () =>
      !!(
        personaForm.name ||
        personaForm.specialty ||
        personaForm.instructions ||
        personaIconFile.value
      ),
  );
  const persona = computed(() => personas.value.find((item) => item.id === personaId.value));
  const tokenPublications = computed<Record<string, GrantPublication>>(() => ({
    ...publications.value,
    ...additionalPublications.value,
  }));
  const path = (): string => `/api/admin/personas/${personaId.value}`;

  function readPersonaData(id: string): Promise<PersonaLoadedData> {
    return loadPersonaData(api, id);
  }

  function applyPersonaData(id: string, data: PersonaLoadedData): void {
    if (personaId.value !== id) {
      return;
    }
    sources.value = data.sources;
    drafts.value = data.drafts;
    publications.value = data.publications;
    additionalPublications.value = data.additionalPublications;
    hooks.syncQueryPublications(data.publications);
    loadedPersonaId.value = id;
  }

  async function load(): Promise<void> {
    const id = personaId.value;
    if (!persona.value?.active) {
      loadedPersonaId.value = id;
      return;
    }
    applyPersonaData(id, await readPersonaData(id));
  }

  function clearPersona(): void {
    hooks.resetWorkspace();
    sources.value = [];
    drafts.value = [];
    publications.value = {};
    additionalPublications.value = {};
  }

  async function choosePersona(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const nextId = select.value;
    if (personaDirty() && !(await confirmDiscard())) {
      personaId.value = loadedPersonaId.value;
      select.value = loadedPersonaId.value;
      return;
    }
    requests.reset();
    clearPersona();
    personaId.value = nextId;
    if (personaId.value) {
      await run(load);
    }
    if (persona.value && !persona.value.active) {
      await router.push({ name: "overview" });
    }
  }

  async function createPersona(): Promise<void> {
    await run(async () => {
      if (personaDirty() && !(await confirmDiscard())) {
        return;
      }
      const response = await api<{ persona: Persona }>("/api/admin/personas", personaForm);
      const icon = personaIconFile.value;
      if (icon) {
        if (icon.size > 512 * 1024) {
          throw new Error("Escolha uma imagem de até 512 KiB.");
        }
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => reject(new Error("Não foi possível ler o ícone."));
          reader.readAsDataURL(icon);
        });
        const image = encoded.split(",")[1];
        if (!image) {
          throw new Error("Não foi possível ler o ícone.");
        }
        await api(`/api/admin/personas/${response.persona.id}/icone`, {
          expectedRevision: 0,
          image,
        });
      }
      personas.value.push(response.persona);
      clearPersona();
      personaId.value = response.persona.id;
      Object.assign(personaForm, { name: "", specialty: "", instructions: "" });
      personaIconFile.value = undefined;
      await load();
      personaOpen.value = false;
      message.value = "Persona criada. A base comum de SQL e plug_server já está disponível.";
    });
    if (personaId.value && !error.value) {
      await router.push({ name: "overview" });
    }
  }

  async function savePersona(input: unknown): Promise<void> {
    await run(async () => {
      const response = await api<{ persona: Persona }>(`${path()}/editar`, input);
      personas.value = personas.value.map((item) =>
        item.id === response.persona.id ? response.persona : item,
      );
      settingsDirty.value = false;
      hooks.clearDependentEditors();
      message.value = "Persona atualizada. As permissões dos tokens continuam explícitas.";
    }, "persona-settings");
  }

  async function changePersonaState(active: boolean): Promise<void> {
    if (personaDirty() && !(await confirmDiscard())) {
      return;
    }
    const selected = persona.value;
    if (!selected) {
      return;
    }
    await run(async () => {
      const response = await api<{ persona: Persona }>(
        `${path()}/${active ? "recuperar" : "suspender"}`,
        {
          expectedVersion: selected.authorizationVersion,
        },
      );
      requests.reset();
      clearPersona();
      personas.value = personas.value.map((item) =>
        item.id === selected.id ? response.persona : item,
      );
      await load();
      message.value = active
        ? "Persona recuperada. Revise e publique novamente as skills; conexões revogadas permanecem revogadas."
        : "Persona suspensa. Publicações suspensas e conexões derivadas revogadas.";
    });
    if (!error.value) {
      await router.push({ name: "overview" });
    }
  }

  async function openImportedDraft(reference: ImportedDraftReference): Promise<void> {
    let opened = false;
    await run(async () => {
      if (anyDirty() && !(await confirmDiscard())) {
        return;
      }
      if (!logged.value) {
        return;
      }
      const latest = await api<{ personas: Persona[] }>("/api/admin/personas");
      const target = latest.personas.find((item) => item.id === reference.personaId && item.active);
      if (!target) {
        throw new Error("A persona de destino está indisponível. A edição atual foi preservada.");
      }
      const data = await readPersonaData(target.id);
      const draft = data.drafts.find(
        (item) => item.id === reference.skillId && item.kind === "consulta",
      );
      if (!draft) {
        throw new Error("O treinamento criado está indisponível. A edição atual foi preservada.");
      }
      requests.reset();
      clearPersona();
      discardArea("catalog");
      Object.assign(personaForm, { name: "", specialty: "", instructions: "" });
      personas.value = latest.personas;
      personaId.value = target.id;
      applyPersonaData(target.id, data);
      hooks.selectDraft(draft);
      opened = true;
    });
    if (
      !opened ||
      !logged.value ||
      personaId.value !== reference.personaId ||
      hooks.currentDraftId() !== reference.skillId
    ) {
      return;
    }
    await router.push({ name: "training" });
    if (area.value === "training") {
      importedDraftFocus.value = reference;
    }
  }

  return {
    personas,
    personaId,
    loadedPersonaId,
    personaForm,
    personaIconFile,
    personaSearch,
    matchingPersonas,
    sources,
    drafts,
    publications,
    additionalPublications,
    tokenPublications,
    persona,
    personaOpen,
    newPersonaDirty,
    importedDraftFocus,
    path,
    readPersonaData,
    applyPersonaData,
    load,
    choosePersona,
    createPersona,
    savePersona,
    changePersonaState,
    openImportedDraft,
    clearPersona,
  };
}
