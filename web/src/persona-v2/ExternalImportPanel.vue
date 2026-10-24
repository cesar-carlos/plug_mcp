<script setup lang="ts">
import { ref, shallowRef, watch, onBeforeUnmount } from "vue";
import type { IntegrationReference } from "../../../src/domain/persona-v2/integration-credential";
import type {
  ExternalImportCandidate,
  ExternalImportResult,
} from "../../../src/domain/persona-v2/external-import";
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  connections: readonly (IntegrationReference & { active: boolean })[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  apply: [ExternalImportCandidate, ExternalImportResult["connection"]];
  dirty: [boolean];
  lock: [boolean];
}>();
const integrationId = ref(""),
  documentText = ref(""),
  busy = ref(false),
  error = ref(""),
  result = shallowRef<ExternalImportResult>(),
  selected = ref("");
let live = true,
  epoch = 0;
watch([documentText, result], () => emit("dirty", !!documentText.value || !!result.value));
watch(integrationId, () => {
  epoch++;
  result.value = undefined;
  selected.value = "";
  error.value = "";
});
onBeforeUnmount(() => {
  live = false;
  epoch++;
  documentText.value = "";
  result.value = undefined;
  emit("dirty", false);
});
async function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || props.disabled || busy.value) return;
  if (documentText.value && !(await props.confirmDiscard())) return;
  const request = ++epoch;
  try {
    if (file.size > 524288) throw new Error();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (!live || request !== epoch) return;
    documentText.value = text;
    result.value = undefined;
    error.value = "";
  } catch {
    error.value = "Use arquivo JSON UTF-8 válido com até 512 KiB.";
  }
}
async function inspect() {
  if (props.disabled || busy.value) return;
  const connection = props.connections.find((c) => c.id === integrationId.value);
  if (!connection) return;
  const request = ++epoch;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  result.value = undefined;
  try {
    const body =
      connection.kind === "mcp_http"
        ? {
            kind: "mcp",
            integrationId: connection.id,
            version: connection.version,
            confirmed: "discover",
          }
        : {
            kind: "openapi",
            integrationId: connection.id,
            version: connection.version,
            document: JSON.parse(documentText.value) as unknown,
          };
    const response = await props.api<ExternalImportResult>(
      `${props.base}/integracoes/importar`,
      body,
    );
    if (live && request === epoch) {
      result.value = response;
      selected.value = "";
    }
  } catch {
    if (live && request === epoch)
      error.value =
        "Não foi possível obter propostas. Confira integração, sessão, limites e gramática suportada.";
  } finally {
    busy.value = false;
    if (live) emit("lock", false);
  }
}
function apply() {
  const candidate = result.value?.candidates.find((c) => c.key === selected.value);
  if (!candidate?.proposal || !result.value || props.disabled || busy.value) return;
  emit("apply", candidate, result.value.connection);
}
function clear() {
  epoch++;
  documentText.value = "";
  result.value = undefined;
  selected.value = "";
  error.value = "";
}
defineExpose({ clear });
</script>
<template>
  <section aria-label="Descoberta e importação externa">
    <h3>Importar uma operação como rascunho</h3>
    <p>
      OpenAPI 3.0/3.1 em JSON é interpretado sem acessar URLs. Descoberta MCP usa somente initialize
      e tools/list, sem chamar ferramentas. Selecione explicitamente uma proposta e revise-a no
      editor.
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <fieldset :disabled="disabled || busy">
      <label
        >Integração para descoberta ou importação<select v-model="integrationId">
          <option value="">Selecione</option>
          <option v-for="c in connections" :key="c.id" :value="c.id">
            {{ c.name }} · {{ c.kind }} · versão {{ c.version }}
          </option>
        </select></label
      >
      <template v-if="connections.find((c) => c.id === integrationId)?.kind === 'rest'">
        <label
          >Arquivo OpenAPI JSON<input
            type="file"
            accept=".json,application/json"
            @change="fileChanged"
        /></label>
        <label
          >Documento OpenAPI JSON<textarea
            v-model="documentText"
            maxlength="524288"
            @input="result = undefined"
          />
        </label>
        <p>
          Servers, credenciais e exemplos não são importados. Rotas com parâmetros de caminho,
          formatos, enums, objetos aninhados e outras restrições não suportadas serão recusadas.
        </p>
      </template>
      <button type="button" :disabled="!integrationId" @click="inspect">
        {{
          connections.find((c) => c.id === integrationId)?.kind === "mcp_http"
            ? "Descobrir ferramentas MCP"
            : "Analisar OpenAPI"
        }}
      </button>
      <button type="button" @click="clear">Descartar importação externa</button>
      <template v-if="result">
        <p v-for="warning in result.warnings" :key="warning">{{ warning }}</p>
        <p v-if="!result.candidates.length">Nenhuma operação encontrada.</p>
        <label
          >Operação a revisar<select v-model="selected">
            <option value="">Selecione</option>
            <option
              v-for="candidate in result.candidates"
              :key="candidate.key"
              :value="candidate.key"
              :disabled="!candidate.proposal"
            >
              {{ candidate.name }} · {{ candidate.key
              }}{{ candidate.proposal ? "" : " · não suportada" }}
            </option>
          </select></label
        >
        <ul>
          <li
            v-for="candidate in result.candidates.filter((c) => c.issues.length)"
            :key="candidate.key"
          >
            {{ candidate.key }}: {{ candidate.issues.join(" ") }}
          </li>
        </ul>
        <button type="button" :disabled="!selected" @click="apply">
          Preparar rascunho desta operação
        </button>
      </template>
    </fieldset>
  </section>
</template>
