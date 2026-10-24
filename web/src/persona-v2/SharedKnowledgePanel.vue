<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import StructureEditor from "./StructureEditor.vue";
import KnowledgeCurationPanel from "./KnowledgeCurationPanel.vue";
import KnowledgeReviewCalendar from "./KnowledgeReviewCalendar.vue";
import { publicationDeadline } from "./publication-deadline";
import KnowledgeLibraryPanel from "./KnowledgeLibraryPanel.vue";
import KnowledgeImpact from "./KnowledgeImpact.vue";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { ImportedDraftReference } from "./model";

interface Catalog {
  id: string;
  name: string;
  role: string;
  authorizationVersion: number;
}
interface Pattern {
  id: string;
  slug: string;
  name: string;
  revision: number;
  content: unknown;
  activePublicationId: string | null;
}
interface Publication {
  id: string;
  patternId: string;
  revision: number;
  hash: string;
  content: unknown;
  suspendedAt: string | null;
}
interface Preview {
  reviewDueAt: string;
  confirmationHash: string;
  packageHash: string;
  expiresAt: string;
  content: unknown;
  changedFields: string[];
  changes: { kind: string; path: string }[];
  warnings: string[];
}
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  openDraft: [value: ImportedDraftReference];
}>();
const catalogs = ref<Catalog[]>([]),
  catalogId = ref(""),
  catalogName = ref("");
const patterns = ref<Pattern[]>([]),
  publications = ref<Publication[]>([]);
const busy = ref(false),
  error = ref(""),
  message = ref("");
const patternId = ref(""),
  slug = ref(""),
  name = ref(""),
  revision = ref(0),
  content = ref<unknown>();
const saved = ref(""),
  reviewDate = ref(""),
  preview = ref<Preview>(),
  confirmed = ref(false);
const curationDirty = ref(false),
  libraryDirty = ref(false),
  libraryKey = ref(0),
  reviewDirty = ref<Record<string, boolean>>({}),
  curationKey = ref(0);
const clientId = ref(""),
  role = ref("reader");
const members = ref<{ hubClientId: string; role: string }[]>([]);
const versions = ref<Publication[]>([]),
  historyPatternId = ref(""),
  nextCursor = ref<string | null>(null);
const beforeId = ref(""),
  afterId = ref("");
const comparison = ref<{
  beforeHash: string;
  afterHash: string;
  changes: { kind: string; path: string }[];
}>();
const catalog = computed(() => catalogs.value.find((c) => c.id === catalogId.value));
const mayEdit = computed(() => catalog.value && catalog.value.role !== "reader");
const mayPublish = computed(() => ["administrator", "curator"].includes(catalog.value?.role ?? ""));
const fingerprint = computed(() =>
  JSON.stringify({ slug: slug.value, name: name.value, content: content.value }),
);
const dirty = computed(
  () =>
    (content.value !== undefined || !!slug.value || !!name.value) &&
    fingerprint.value !== saved.value,
);
const formsDirty = computed(
  () =>
    dirty.value ||
    !!catalogName.value ||
    !!clientId.value ||
    curationDirty.value ||
    libraryDirty.value ||
    Object.values(reviewDirty.value).some(Boolean) ||
    !!reviewDate.value,
);
watch(formsDirty, (value) => emit("dirty", value));
watch(busy, (value) => emit("lock", value));
watch(reviewDate, () => {
  preview.value = undefined;
  confirmed.value = false;
});
const roleLabel: Record<string, string> = {
  administrator: "Administrador",
  curator: "Curador",
  contributor: "Colaborador",
  reader: "Leitor",
};
const root = () => `/api/admin/catalogos/${catalogId.value}`;
const changeLabel: Record<string, string> = {
  added: "Acrescentado",
  removed: "Removido",
  changed: "Alterado",
};
let live = true;
onBeforeUnmount(() => {
  live = false;
  emit("dirty", false);
});
watch(fingerprint, () => {
  preview.value = undefined;
  confirmed.value = false;
});
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) {
    return;
  }
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (cause) {
    if (live) {
      error.value = cause instanceof Error ? cause.message : "Não foi possível concluir.";
    }
  } finally {
    if (live) {
      busy.value = false;
    }
  }
}
function resetEditor() {
  reviewDate.value = "";
  patternId.value = "";
  slug.value = "";
  name.value = "";
  revision.value = 0;
  content.value = undefined;
  saved.value = "";
  preview.value = undefined;
  confirmed.value = false;
}
function resetHistory() {
  reviewDirty.value = {};
  versions.value = [];
  historyPatternId.value = "";
  nextCursor.value = null;
  beforeId.value = "";
  afterId.value = "";
  comparison.value = undefined;
}
async function refresh() {
  const result = await props.api<{ catalogs: Catalog[] }>("/api/admin/catalogos");
  if (!live) {
    return;
  }
  catalogs.value = result.catalogs;
  if (catalogId.value && !catalog.value) {
    catalogId.value = "";
    patterns.value = [];
    publications.value = [];
    members.value = [];
    resetEditor();
    resetHistory();
    throw new Error("O acesso ao catálogo mudou. Selecione um catálogo disponível.");
  }
  if (catalogId.value) {
    const data = await props.api<{ patterns?: Pattern[]; publications?: Publication[] }>(
      `${root()}/padroes`,
    );
    if (live) {
      patterns.value = data.patterns ?? [];
      publications.value = data.publications ?? [];
    }
    if (catalog.value?.role === "administrator") {
      const data = await props.api<{ members: { hubClientId: string; role: string }[] }>(
        `${root()}/membros`,
      );
      if (live) {
        members.value = data.members;
      }
    } else {
      members.value = [];
    }
  }
}
async function chooseCatalog(event: Event) {
  const selected = (event.target as HTMLSelectElement).value;
  if (formsDirty.value && !(await props.confirmDiscard())) {
    (event.target as HTMLSelectElement).value = catalogId.value;
    return;
  }
  catalogId.value = selected;
  libraryDirty.value = false;
  libraryKey.value++;
  curationDirty.value = false;
  curationKey.value++;
  patterns.value = [];
  publications.value = [];
  members.value = [];
  resetEditor();
  resetHistory();
  void run(refresh);
}
async function createCatalog() {
  if (
    (dirty.value ||
      libraryDirty.value ||
      curationDirty.value ||
      !!reviewDate.value ||
      Object.values(reviewDirty.value).some(Boolean)) &&
    !(await props.confirmDiscard())
  )
    return;
  await run(async () => {
    const result = await props.api<{ catalog: Catalog }>("/api/admin/catalogos", {
      name: catalogName.value,
    });
    if (!live) {
      return;
    }
    catalogId.value = result.catalog.id;
    curationDirty.value = false;
    curationKey.value++;
    catalogName.value = "";
    resetEditor();
    resetHistory();
    await refresh();
    message.value = "Catálogo privado criado. Conceda acesso para compartilhar.";
  });
}
async function edit(pattern: Pattern) {
  if ((dirty.value || !!reviewDate.value) && !(await props.confirmDiscard())) {
    return;
  }
  patternId.value = pattern.id;
  reviewDate.value = "";
  slug.value = pattern.slug;
  name.value = pattern.name;
  revision.value = pattern.revision;
  content.value = JSON.parse(JSON.stringify(pattern.content)) as unknown;
  saved.value = fingerprint.value;
}
async function importedDdl(value: StructureContent) {
  if (
    (dirty.value || libraryDirty.value || !!reviewDate.value) &&
    !(await props.confirmDiscard())
  ) {
    return;
  }
  resetEditor();
  content.value = value;
  libraryDirty.value = false;
  libraryKey.value++;
  message.value =
    "Declarações aplicadas somente ao novo rascunho em edição. Revise grão, significado e classificação antes de salvar; a adoção exige inspeção.";
}
async function curationUpdated(id: string) {
  await refresh();
  if (patternId.value === id && !dirty.value) {
    const current = patterns.value.find((p) => p.id === id);
    if (current) await edit(current);
  }
}
async function newPattern() {
  if ((!dirty.value && !reviewDate.value) || (await props.confirmDiscard())) {
    resetEditor();
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  await run(async () => {
    if (file.size > 50 * 1024 || !file.name.toLowerCase().endsWith(".json")) {
      throw new Error("Selecione um arquivo JSON de até 50 KiB.");
    }
    const parsed: unknown = JSON.parse(await file.text());
    if (live) {
      content.value = parsed;
    }
  });
}
async function save() {
  await run(async () => {
    const result = await props.api<{ pattern: Pattern }>(
      patternId.value ? `${root()}/padroes/${patternId.value}/editar` : `${root()}/padroes`,
      patternId.value
        ? { expectedRevision: revision.value, name: name.value, content: content.value }
        : { slug: slug.value, name: name.value, content: content.value },
    );
    if (!live) {
      return;
    }
    const p = result.pattern;
    patternId.value = p.id;
    revision.value = p.revision;
    content.value = p.content;
    saved.value = fingerprint.value;
    await refresh();
    message.value = "Rascunho salvo. A publicação exige revisão de um curador.";
  });
}
async function prepare() {
  await run(async () => {
    const result = await props.api<Preview>(`${root()}/padroes/${patternId.value}/preview`, {
      reviewDueAt: publicationDeadline(reviewDate.value),
    });
    if (live) {
      preview.value = result;
      confirmed.value = false;
    }
  });
}
async function publish() {
  if (!preview.value || !confirmed.value || dirty.value) {
    return;
  }
  await run(async () => {
    await props.api(`${root()}/padroes/${patternId.value}/publicar`, {
      confirmationHash: preview.value!.confirmationHash,
    });
    reviewDate.value = "";
    if (!live) {
      return;
    }
    preview.value = undefined;
    confirmed.value = false;
    await refresh();
    message.value =
      "Versão compartilhada publicada. Adoção pelas fontes ainda exige compatibilidade e republicação das skills.";
  });
}
async function setMember() {
  await run(async () => {
    await props.api(`${root()}/membros`, {
      expectedVersion: catalog.value!.authorizationVersion,
      hubClientId: clientId.value,
      role: role.value || null,
    });
    if (!live) {
      return;
    }
    clientId.value = "";
    preview.value = undefined;
    confirmed.value = false;
    await refresh();
    message.value = "Permissão do catálogo atualizada.";
  });
}
async function history(id: string, cursor?: string) {
  if (!cursor && Object.values(reviewDirty.value).some(Boolean) && !(await props.confirmDiscard()))
    return;
  await run(async () => {
    if (!cursor) resetHistory();
    const result = await props.api<{ publications: Publication[]; nextCursor: string | null }>(
      `${root()}/padroes/${id}/versoes${cursor ? `?beforeId=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (!live) return;
    historyPatternId.value = id;
    versions.value = cursor ? [...versions.value, ...result.publications] : result.publications;
    nextCursor.value = result.nextCursor;
    comparison.value = undefined;
  });
}
async function compare() {
  await run(async () => {
    comparison.value = undefined;
    const result = await props.api<NonNullable<typeof comparison.value>>(`${root()}/comparar`, {
      beforeId: beforeId.value,
      afterId: afterId.value,
    });
    if (live) comparison.value = result;
  });
}
async function suspend(publication: Publication) {
  if (
    !window.confirm("Suspender esta versão compartilhada? Ela ficará indisponível para leitores.")
  )
    return;
  await run(async () => {
    await props.api(`${root()}/publicacoes/${publication.id}/suspender`, {});
    if (!live) return;
    resetHistory();
    preview.value = undefined;
    confirmed.value = false;
    await refresh();
    message.value = "Versão suspensa. O conteúdo publicado foi preservado.";
  });
}
watch([beforeId, afterId], () => {
  comparison.value = undefined;
});
</script>

<template>
  <details>
    <summary>Conhecimento compartilhado</summary>
    <section aria-label="Conhecimento compartilhado">
      <h2>Catálogos de estrutura</h2>
      <p>
        Compartilhe padrões e exemplos revisados entre responsáveis autorizados. A associação
        executável às bases ainda está em desenvolvimento.
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <fieldset :disabled="busy || disabled">
        <button type="button" @click="run(refresh)">Carregar catálogos</button>
        <label
          >Catálogo<select :value="catalogId" @change="chooseCatalog">
            <option value="">Selecione</option>
            <option v-for="c in catalogs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select></label
        >
        <form aria-label="Criar catálogo" @submit.prevent="createCatalog">
          <label>Nome do catálogo<input v-model="catalogName" maxlength="200" required /></label>
          <button>Criar catálogo privado</button>
        </form>
        <template v-if="catalog">
          <p>Seu papel: {{ roleLabel[catalog.role] }}.</p>
          <ul>
            <li v-for="p in patterns" :key="p.id">
              <button type="button" @click="edit(p)">
                {{ p.name }} · revisão {{ p.revision }}
              </button>
              <button type="button" @click="history(p.id)">Ver versões de {{ p.name }}</button>
            </li>
          </ul>
          <article v-for="p in publications" :key="p.id">
            <h3>Versão publicada · revisão {{ p.revision }}</h3>
            <pre>{{ JSON.stringify(p.content, null, 2) }}</pre>
            <button type="button" @click="history(p.patternId)">Ver versões deste padrão</button>
          </article>
          <section v-if="historyPatternId" aria-label="Versões do padrão">
            <h3>Versões publicadas</h3>
            <p>Comparar versões não altera fontes nem skills. Suspensão preserva o histórico.</p>
            <article v-for="v in versions" :key="v.id">
              <p>Revisão {{ v.revision }} · {{ v.suspendedAt ? "Suspensa" : "Disponível" }}</p>
              <KnowledgeImpact
                :root="`${root()}/publicacoes/${v.id}`"
                :api="api"
                :disabled="disabled || busy"
              />
              <details>
                <summary>Conteúdo da revisão {{ v.revision }}</summary>
                <pre>{{ JSON.stringify(v.content, null, 2) }}</pre>
              </details>
              <button
                v-if="mayPublish"
                type="button"
                :disabled="!!v.suspendedAt"
                @click="suspend(v)"
              >
                Suspender revisão {{ v.revision }}
              </button>
              <KnowledgeReviewCalendar
                v-if="mayPublish && !v.suspendedAt"
                :root="`${root()}/publicacoes/${v.id}/revisao`"
                :api="api"
                :disabled="disabled || busy"
                :confirm-discard="confirmDiscard"
                @dirty="reviewDirty[v.id] = $event"
                @lock="busy = $event"
              />
            </article>
            <button v-if="nextCursor" type="button" @click="history(historyPatternId, nextCursor)">
              Carregar versões anteriores
            </button>
            <form aria-label="Comparar versões do padrão" @submit.prevent="compare">
              <label
                >Versão de origem<select v-model="beforeId" required>
                  <option value="">Selecione</option>
                  <option v-for="v in versions" :key="v.id" :value="v.id">
                    Revisão {{ v.revision }} · {{ v.id }}
                  </option>
                </select></label
              >
              <label
                >Versão de destino<select v-model="afterId" required>
                  <option value="">Selecione</option>
                  <option v-for="v in versions" :key="v.id" :value="v.id">
                    Revisão {{ v.revision }} · {{ v.id }}
                  </option>
                </select></label
              >
              <button :disabled="!beforeId || !afterId">Comparar versões</button>
            </form>
            <div v-if="comparison" role="status">
              <p v-if="!comparison.changes.length">Nenhuma alteração no conteúdo.</p>
              <ul v-else>
                <li v-for="c in comparison.changes" :key="c.path">
                  {{ changeLabel[c.kind] }}: {{ c.path }}
                </li>
              </ul>
            </div>
          </section>
          <template v-if="mayEdit">
            <KnowledgeLibraryPanel
              :key="`${catalog.id}:${libraryKey}`"
              :catalog-id="catalog.id"
              :content="content"
              :api="api"
              :disabled="disabled"
              :confirm-discard="confirmDiscard"
              @dirty="libraryDirty = $event"
              @lock="busy = $event"
              @imported="importedDdl"
              @open-draft="emit('openDraft', $event)"
            />
            <KnowledgeCurationPanel
              v-if="catalog"
              :key="`${catalog.id}:${curationKey}`"
              :catalog-id="catalog.id"
              :role="catalog.role"
              :patterns="patterns"
              :api="api"
              :disabled="disabled"
              :draft-dirty="dirty"
              :confirm-discard="confirmDiscard"
              @dirty="curationDirty = $event"
              @lock="busy = $event"
              @updated="curationUpdated"
            />
            <button type="button" @click="newPattern">Novo padrão</button>
            <form aria-label="Editar padrão compartilhado" @submit.prevent="save">
              <label
                >Identificação do padrão<input
                  v-model="slug"
                  :disabled="!!patternId"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxlength="100"
                  required
              /></label>
              <label>Nome do padrão<input v-model="name" maxlength="200" required /></label>
              <StructureEditor v-model="content" />
              <label
                >Importar estrutura revisada<input
                  type="file"
                  accept=".json,application/json"
                  @change="importFile"
              /></label>
              <p>
                Opcional: importe uma estrutura em JSON para revisar pelo formulário. Arquivos
                importados não são executados no banco.
              </p>
              <details v-if="content !== undefined">
                <summary>Conferir conteúdo importado</summary>
                <pre>{{ JSON.stringify(content, null, 2) }}</pre>
              </details>
              <p v-if="dirty">Há alterações não salvas.</p>
              <button :disabled="content === undefined">Salvar padrão</button>
            </form>
            <label v-if="mayPublish"
              >Prazo de revisão da publicação<input v-model="reviewDate" type="datetime-local"
            /></label>
            <button
              v-if="mayPublish"
              type="button"
              :disabled="!patternId || dirty"
              @click="prepare"
            >
              Revisar padrão para publicação
            </button>
            <div v-if="preview">
              <p>Próxima revisão: {{ new Date(preview.reviewDueAt).toLocaleString() }}</p>
              <p>Campos alterados: {{ preview.changedFields.join(", ") }}</p>
              <ul>
                <li v-for="c in preview.changes" :key="c.path">
                  {{ changeLabel[c.kind] }}: {{ c.path }}
                </li>
              </ul>
              <p>Validade: {{ new Date(preview.expiresAt).toLocaleString() }}</p>
              <p v-for="warning in preview.warnings" :key="warning">{{ warning }}</p>
              <details>
                <summary>Conteúdo exato da publicação</summary>
                <pre>{{ JSON.stringify(preview.content, null, 2) }}</pre>
              </details>
              <label
                ><input v-model="confirmed" type="checkbox" />Revisei a estrutura, os significados e
                os exemplos desta versão.</label
              >
              <button
                type="button"
                :disabled="!confirmed || dirty || Date.parse(preview.expiresAt) <= Date.now()"
                @click="publish"
              >
                Confirmar publicação do padrão
              </button>
            </div>
          </template>
          <form
            v-if="catalog.role === 'administrator'"
            aria-label="Permissões do catálogo"
            @submit.prevent="setMember"
          >
            <h3>Participantes</h3>
            <ul>
              <li v-for="member in members" :key="member.hubClientId">
                {{ member.hubClientId }} · {{ member.role }}
              </li>
            </ul>
            <label
              >ID Client do participante<input v-model="clientId" maxlength="200" required
            /></label>
            <label
              >Papel do participante<select v-model="role">
                <option value="reader">Leitor</option>
                <option value="contributor">Colaborador</option>
                <option value="curator">Curador</option>
                <option value="administrator">Administrador</option>
                <option value="">Revogar acesso</option>
              </select></label
            >
            <button>Salvar permissão do catálogo</button>
          </form>
        </template>
      </fieldset>
    </section>
  </details>
</template>

<style scoped>
section,
form {
  display: grid;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
}
fieldset {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
pre {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
input,
select,
button {
  max-width: 100%;
}
</style>
