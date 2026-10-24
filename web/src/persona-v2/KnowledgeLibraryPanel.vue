<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { z } from "zod";
import type { ImportedDraftReference } from "./model";
import { useErrorSummary } from "./useErrorSummary";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import KnowledgeDatasetEditor from "./KnowledgeDatasetEditor.vue";
interface Item {
  templateId?: string | null;
  templateVersion?: number | null;
  id: string;
  slug: string;
  kind: string;
  name: string;
  version: number;
  hash: string;
  payload?: LibraryPayload;
}
const props = defineProps<{
  catalogId: string;
  content: unknown;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  lock: [boolean];
  imported: [StructureContent];
  openDraft: [ImportedDraftReference];
}>();
const createdDraft = ref<ImportedDraftReference>();
const items = ref<Item[]>([]),
  cursor = ref<string | null>(null),
  selected = ref<Item>(),
  payload = ref(""),
  slug = ref(""),
  name = ref(""),
  saved = ref(""),
  busy = ref(false),
  message = ref("");
const datasetDirty = ref(false);
const datasetEditorVersion = ref(0);
const historyVersion = ref(1),
  datasetId = ref(""),
  ddl = ref(""),
  system = ref(""),
  label = ref(""),
  dialect = ref("postgres"),
  declaration = ref<{ content: StructureContent; warnings: string[] }>();
const personas = ref<{ id: string; name: string }[]>([]),
  personaId = ref(""),
  sources = ref<{ id: string; name: string; dialect: string; authorizationVersion: number }[]>([]),
  sourceId = ref(""),
  chosenDialect = ref(""),
  exampleId = ref(""),
  additionalExampleIds = ref<string[]>([]),
  skillSlug = ref(""),
  skillName = ref("");
const { error, errorSummary } = useErrorSummary();
let live = true;
const root = computed(() => `/api/admin/catalogos/${props.catalogId}`);
const dirty = computed(
  () =>
    datasetDirty.value ||
    (JSON.stringify({ payload: payload.value, slug: slug.value, name: name.value }) !==
      saved.value &&
      !!(payload.value || slug.value || name.value)) ||
    !!(
      ddl.value ||
      system.value ||
      label.value ||
      personaId.value ||
      sourceId.value ||
      chosenDialect.value ||
      exampleId.value ||
      additionalExampleIds.value.length ||
      datasetId.value ||
      skillSlug.value ||
      skillName.value
    ),
);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
onBeforeUnmount(() => {
  live = false;
  emit("dirty", false);
  emit("lock", false);
});
const template = computed(() =>
  selected.value?.payload?.kind === "template" ? selected.value.payload.content : undefined,
);
const additionalExamples = computed(
  () =>
    template.value?.examples.filter(
      (e) => e.id !== exampleId.value && e.variants.some((v) => v.dialect === chosenDialect.value),
    ) ?? [],
);
watch([exampleId, chosenDialect], () => {
  additionalExampleIds.value = [];
});
watch([ddl, system, label, dialect], () => {
  declaration.value = undefined;
});
const datasets = computed(() =>
  items.value.filter(
    (i) =>
      i.kind === "dataset" &&
      i.templateId === selected.value?.id &&
      i.templateVersion === selected.value?.version,
  ),
);
function clearDestination() {
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
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) {
    return;
  }
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (e) {
    if (live) {
      error.value = e instanceof Error ? e.message : "Biblioteca indisponível.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
function show(item: Item) {
  datasetEditorVersion.value++;
  datasetDirty.value = false;
  clearDestination();
  selected.value = item;
  slug.value = item.slug;
  name.value = item.name;
  payload.value = JSON.stringify(item.payload, null, 2);
  saved.value = JSON.stringify({ payload: payload.value, slug: slug.value, name: name.value });
  historyVersion.value = item.version;
}
async function load(more = false) {
  await run(async () => {
    const data = await props.api<{ items: Item[]; nextCursor: string | null }>(
      root.value + "/biblioteca" + (more && cursor.value ? `?beforeId=${cursor.value}` : ""),
    );
    if (live) {
      items.value = more ? [...items.value, ...data.items] : data.items;
      cursor.value = data.nextCursor;
    }
  });
}
async function choose(item: Item, version?: number) {
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(async () => {
    const data = await props.api<Item>(
      `${root.value}/biblioteca/${item.id}` + (version ? `?version=${version}` : ""),
    );
    if (live) {
      show(data);
      ddl.value = "";
      system.value = "";
      label.value = "";
      skillSlug.value = "";
      skillName.value = "";
      declaration.value = undefined;
    }
  });
}
async function fresh() {
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  selected.value = undefined;
  payload.value = "";
  slug.value = "";
  name.value = "";
  saved.value = "";
  skillSlug.value = "";
  skillName.value = "";
  ddl.value = "";
  system.value = "";
  label.value = "";
  declaration.value = undefined;
  clearDestination();
}
async function capture() {
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  selected.value = undefined;
  payload.value = JSON.stringify({ kind: "template", content: props.content }, null, 2);
  slug.value = "";
  name.value = "";
  saved.value = "";
  clearDestination();
}
async function save() {
  await run(async () => {
    let raw: unknown;
    try {
      raw = JSON.parse(payload.value);
    } catch {
      throw new Error("JSON inválido. Confira a estrutura do material.");
    }
    if (new TextEncoder().encode(payload.value).length > 50 * 1024) {
      throw new Error("Material excede 50 KiB.");
    }
    const data = await props.api<Item>(
      root.value + "/biblioteca" + (selected.value ? `/${selected.value.id}/versoes` : ""),
      {
        slug: slug.value,
        name: name.value,
        expectedVersion: selected.value?.version ?? 0,
        payload: raw,
      },
    );
    if (live) {
      show(data);
      message.value =
        "Versão editorial salva. Exemplos permanecem candidatos; nenhuma publicação ou aprovação foi herdada.";
    }
  });
}
async function saveDataset(input: { slug: string; name: string; payload: LibraryPayload }) {
  await run(async () => {
    const data = await props.api<Item>(root.value + "/biblioteca", {
      ...input,
      expectedVersion: 0,
    });
    if (live) {
      show(data);
      datasetDirty.value = false;
      message.value =
        "Dataset editorial salvo com a versão exata do template. Nenhum caso ou relatório foi aprovado.";
    }
  });
}
async function parseDdl() {
  await run(async () => {
    const data = await props.api<{ content: StructureContent; warnings: string[] }>(
      root.value + "/importar-ddl",
      { system: system.value, label: label.value, dialect: dialect.value, ddl: ddl.value },
    );
    if (live) {
      declaration.value = data;
    }
  });
}
async function readDdl(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  if (ddl.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(async () => {
    if (file.size > 50 * 1024) {
      throw new Error("Arquivo DDL excede 50 KiB.");
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw new Error(
        "Arquivo DDL deve usar UTF-8 válido. Converta a codificação antes de importar.",
      );
    }
    if (live) {
      ddl.value = text;
      declaration.value = undefined;
    }
  });
}
async function loadPersonas() {
  await run(async () => {
    const data = await props.api<{ personas: { id: string; name: string }[] }>(
      "/api/admin/personas",
    );
    if (live) {
      personas.value = data.personas;
    }
  });
}
async function loadSources() {
  sources.value = [];
  sourceId.value = "";
  await run(async () => {
    const data = await props.api<{
      fontes: { id: string; name: string; dialect: string; authorizationVersion: number }[];
    }>(`/api/admin/personas/${personaId.value}/fontes`);
    if (live) {
      sources.value = data.fontes;
    }
  });
}
async function apply() {
  await run(async () => {
    const item = selected.value,
      source = sources.value.find((s) => s.id === sourceId.value);
    if (!item || !source) {
      throw new Error("Selecione template, persona e base.");
    }
    const dataSet = datasetId.value
      ? datasets.value.find((d) => d.id === datasetId.value)
      : undefined;
    if (datasetId.value && !dataSet) {
      throw new Error("Recarregue o dataset autorizado.");
    }
    const destinationPersona = personaId.value;
    createdDraft.value = undefined;
    const raw = await props.api<unknown>(`/api/admin/personas/${personaId.value}/skills/template`, {
      catalogId: props.catalogId,
      templateId: item.id,
      templateVersion: item.version,
      templateHash: item.hash,
      sourceId: source.id,
      sourceVersion: source.authorizationVersion,
      dialect: chosenDialect.value,
      exampleId: exampleId.value,
      additionalExampleIds: additionalExampleIds.value,
      ...(dataSet
        ? { dataset: { id: dataSet.id, version: dataSet.version, hash: dataSet.hash } }
        : {}),
      slug: skillSlug.value,
      name: skillName.value,
    });
    if (live) {
      const data = z
        .object({
          skill: z.object({
            id: z.uuid(),
            personaId: z.uuid(),
            kind: z.literal("consulta"),
            name: z.string().min(1).max(200),
          }),
        })
        .safeParse(raw);
      if (!data.success || data.data.skill.personaId !== destinationPersona) {
        throw new Error(
          "Não foi possível confirmar o rascunho. Confira a lista da persona antes de importar novamente.",
        );
      }
      createdDraft.value = {
        personaId: destinationPersona,
        skillId: data.data.skill.id,
        name: data.data.skill.name,
      };
      clearDestination();
      message.value = `Rascunho ${data.data.skill.name} criado. Revise candidatos, inspecione a base e execute os casos antes de publicar.`;
    }
  });
}
</script>
<template>
  <details>
    <summary>Templates, datasets e importação de DDL</summary>
    <section aria-label="Biblioteca editorial do catálogo">
      <p>
        Material versionado para revisão. Não concede execução, não contém relatórios aprovados e
        não é adotado automaticamente.
      </p>
      <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <fieldset :disabled="disabled || busy">
        <template v-if="createdDraft">
          <button
            type="button"
            aria-describedby="imported-draft-hint"
            @click="emit('openDraft', createdDraft)"
          >
            Abrir treinamento criado
          </button>
          <p id="imported-draft-hint" class="technical-value">
            Abre a revisão salva mais recente de {{ createdDraft.name }} na persona de destino. A
            troca limpa o token de teste e os resultados exibidos; alterações não salvas exigem
            confirmação. Não publica nem executa consultas.
          </p>
        </template>
        <button type="button" @click="load()">Carregar biblioteca</button
        ><button v-if="cursor" type="button" @click="load(true)">
          Carregar materiais anteriores
        </button>
        <ul>
          <li v-for="item in items" :key="item.id">
            <button type="button" @click="choose(item)">
              {{ item.name }} · {{ item.kind }} · versão {{ item.version }}
            </button>
          </li>
        </ul>
        <button type="button" @click="fresh">Novo material editorial</button
        ><button type="button" :disabled="!content" @click="capture">
          Criar template do conteúdo em edição
        </button>
        <form aria-label="Salvar material da biblioteca" @submit.prevent="save">
          <label
            >Identificador do material<input
              v-model="slug"
              :disabled="!!selected"
              required
              maxlength="100"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
          /></label>
          <label>Nome do material<input v-model="name" required maxlength="200" /></label>
          <label
            >Material JSON (template ou dataset)<textarea
              v-model="payload"
              required
              rows="10"
              spellcheck="false"
            />
          </label>
          <p>
            Até 50 KiB. Dataset exige proveniência sintética ou autorização explícita,
            template/versão/hash exatos e valores tipados; decimais usam texto.
          </p>
          <button :disabled="datasetDirty">
            {{ selected ? "Salvar próxima versão editorial" : "Salvar primeiro material" }}
          </button>
        </form>
        <form
          v-if="selected"
          aria-label="Versão histórica da biblioteca"
          @submit.prevent="choose(selected, historyVersion)"
        >
          <label
            >Versão para consultar<input
              v-model.number="historyVersion"
              type="number"
              min="1"
              required /></label
          ><button>Consultar versão exata</button>
        </form>
        <KnowledgeDatasetEditor
          v-if="template && selected"
          :key="`${selected.id}:${selected.version}:${datasetEditorVersion}`"
          :template="{
            id: selected.id,
            version: selected.version,
            hash: selected.hash,
            name: selected.name,
            content: template,
          }"
          :disabled="
            disabled ||
            busy ||
            JSON.stringify({ payload, slug, name }) !== saved ||
            !!(
              ddl ||
              system ||
              label ||
              personaId ||
              sourceId ||
              chosenDialect ||
              exampleId ||
              datasetId ||
              skillSlug ||
              skillName
            )
          "
          @dirty="datasetDirty = $event"
          @create="saveDataset"
        />
        <form v-if="template" aria-label="Criar treinamento de template" @submit.prevent="apply">
          <h4>Criar rascunho de consulta</h4>
          <button type="button" @click="loadPersonas">Carregar personas para o template</button>
          <label
            >Persona de destino<select v-model="personaId" required @change="loadSources">
              <option value="">Selecione</option>
              <option v-for="p in personas" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select></label
          >
          <label
            >Base de destino<select v-model="sourceId" required>
              <option value="">Selecione</option>
              <option v-for="s in sources" :key="s.id" :value="s.id">
                {{ s.name }} · {{ s.dialect }}
              </option>
            </select></label
          >
          <label
            >Variante de dialeto<select v-model="chosenDialect" required>
              <option value="">Selecione explicitamente</option>
              <option v-for="d in template.dialects" :key="d" :value="d">{{ d }}</option>
            </select></label
          >
          <label
            >Exemplo principal<select v-model="exampleId" required>
              <option value="">Selecione</option>
              <option v-for="e in template.examples" :key="e.id" :value="e.id">
                {{ e.purpose }}
              </option>
            </select></label
          >
          <fieldset v-if="exampleId && additionalExamples.length">
            <legend>Exemplos adicionais para o rascunho</legend>
            <p>
              Selecione explicitamente. Devem usar os mesmos parâmetros do principal; todos
              permanecerão candidatos.
            </p>
            <label v-for="e in additionalExamples" :key="e.id">
              <input v-model="additionalExampleIds" type="checkbox" :value="e.id" />{{ e.purpose }}
            </label>
          </fieldset>
          <label
            >Dataset opcional da mesma versão<select v-model="datasetId">
              <option value="">Sem dataset</option>
              <option v-for="d in datasets" :key="d.id" :value="d.id">
                {{ d.name }} · versão {{ d.version }}
              </option>
            </select></label
          >
          <label
            >Identificador do novo treinamento<input
              v-model="skillSlug"
              required
              maxlength="100"
              pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label
          ><label
            >Nome do novo treinamento<input v-model="skillName" required maxlength="200"
          /></label>
          <button :disabled="datasetDirty || JSON.stringify({ payload, slug, name }) !== saved">
            Criar rascunho com base e variante selecionadas
          </button>
        </form>
        <form aria-label="Importar estrutura DDL" @submit.prevent="parseDdl">
          <h4>Interpretar DDL sem executar</h4>
          <label>Sistema declarado<input v-model="system" required maxlength="200" /></label
          ><label>Rótulo da estrutura<input v-model="label" required maxlength="100" /></label>
          <label
            >Dialeto do arquivo<select v-model="dialect">
              <option value="postgres">PostgreSQL</option>
              <option value="mssql">SQL Server</option>
              <option value="sybase">SQL Anywhere</option>
            </select></label
          >
          <label
            >Arquivo DDL (até 50 KiB)<input type="file" accept=".sql,.ddl,.txt" @change="readDdl"
          /></label>
          <label
            >DDL estrutural<textarea
              v-model="ddl"
              required
              rows="8"
              spellcheck="false"
              @input="declaration = undefined"
            /></label
          ><button>Interpretar declarações do arquivo</button>
        </form>
        <section v-if="declaration" aria-label="Declarações importadas">
          <ul>
            <li v-for="w in declaration.warnings" :key="w">{{ w }}</li>
          </ul>
          <p>
            {{ declaration.content.tables.length }} tabelas ·
            {{ declaration.content.relationships.length }} relações. Significado e confirmação
            técnica pendentes.
          </p>
          <button type="button" @click="emit('imported', declaration.content)">
            Usar declarações em novo rascunho de padrão
          </button>
        </section>
      </fieldset>
    </section>
  </details>
</template>
<style scoped>
section,
form,
fieldset,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
textarea {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
}
input,
select,
button {
  max-width: 100%;
}
</style>
