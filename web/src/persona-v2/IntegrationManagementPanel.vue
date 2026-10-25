<script setup lang="ts">
import { ref, reactive, shallowRef, computed, watch, onMounted, onBeforeUnmount } from "vue";
import type {
  ManagedIntegration,
  IntegrationReview,
} from "../../../src/domain/persona-v2/integration-management";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean] }>();
const rows = shallowRef<readonly ManagedIntegration[]>([]),
  review = shallowRef<IntegrationReview>(),
  selected = ref(""),
  busy = ref(false),
  mode = ref<"suspender" | "recuperar" | "rotacionar" | "criar" | "">(""),
  confirmed = ref(false),
  needsReview = ref(false),
  message = ref("");
const form = reactive({
  name: "",
  kind: "rest",
  destination: "",
  ownerEmail: "",
  ownerPassword: "",
  type: "bearer",
  token: "",
  header: "",
  apiKey: "",
  username: "",
  password: "",
});
const { error, errorSummary } = useErrorSummary();
const dirty = computed(
  () =>
    !!mode.value ||
    confirmed.value ||
    Object.entries(form).some(([key, value]) => key !== "type" && key !== "kind" && !!value),
);
watch(dirty, (value) => emit("dirty", value));
let live = true,
  stop: (() => void) | undefined,
  createId = "";
const root = computed(() => `${props.base}/integracoes/gestao`);
function clearSecrets() {
  form.ownerPassword = "";
  form.token = "";
  form.apiKey = "";
  form.password = "";
  form.username = "";
}
function clear(resetReview = false) {
  clearSecrets();
  form.ownerEmail = "";
  form.name = "";
  form.kind = "rest";
  form.destination = "";
  form.header = "";
  form.username = "";
  form.type = "bearer";
  mode.value = "";
  confirmed.value = false;
  if (resetReview) needsReview.value = false;
}
onBeforeUnmount(() => {
  live = false;
  stop?.();
  clear();
  rows.value = [];
  review.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
async function run(fn: () => Promise<void>) {
  if (!live || busy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await fn();
  } catch (cause) {
    if (live)
      error.value =
        cause instanceof Error ? cause.message : "Não foi possível atualizar a integração.";
  } finally {
    busy.value = false;
    if (live) emit("lock", false);
  }
}
async function load() {
  const result = await props.api<{ connections: readonly ManagedIntegration[] }>(root.value);
  if (live) rows.value = result.connections;
}
async function select(event: Event) {
  const input = event.target as HTMLSelectElement,
    next = input.value;
  input.value = selected.value;
  if (dirty.value && !(await props.confirmDiscard())) return;
  await run(async () => {
    const value = next ? await props.api<IntegrationReview>(`${root.value}/${next}`) : undefined;
    if (!live) return;
    clear(true);
    selected.value = next;
    review.value = value;
  });
}
async function refresh() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  await run(async () => {
    await load();
    // A lost response may already have committed. Read by the original request ID;
    // never issue another creation automatically or recover credentials.
    const created = createId && rows.value.find((row) => row.id === createId);
    if (created) selected.value = created.id;
    const value = selected.value
      ? await props.api<IntegrationReview>(`${root.value}/${selected.value}`)
      : undefined;
    if (live) {
      clear(true);
      review.value = value;
      if (created) {
        createId = "";
        message.value =
          "Cadastro localizado. A integração aguarda publicação; credenciais não são recuperáveis.";
      }
    }
  });
}
async function begin(action: typeof mode.value) {
  if (needsReview.value) {
    error.value = "Recarregue o estado e revise antes de outra mudança.";
    return;
  }
  if (dirty.value && !(await props.confirmDiscard())) return;
  if (!live) return;
  clear();
  mode.value = action;
  if (action === "criar" && !createId) createId = globalThis.crypto.randomUUID();
}
async function save() {
  if (!confirmed.value || !mode.value || needsReview.value) return;
  if (mode.value === "criar") {
    await create();
    return;
  }
  if (!review.value) return;
  const action = mode.value,
    connection = review.value.connection;
  await run(async () => {
    try {
      const credential =
        form.type === "bearer"
          ? { credentialType: "bearer", token: form.token }
          : form.type === "api_key"
            ? { credentialType: "api_key", header: form.header, apiKey: form.apiKey }
            : { credentialType: "basic", username: form.username, password: form.password };
      await props.api(
        `${root.value}/${connection.id}/${action === "rotacionar" ? "credenciais" : action}`,
        {
          expectedVersion: connection.managementVersion,
          fingerprint: review.value!.fingerprint,
          confirmed: true,
          ...(action === "rotacionar"
            ? { owner: { email: form.ownerEmail, password: form.ownerPassword }, credential }
            : {}),
        },
      );
      if (!live) return;
      clear(true);
      await load();
      const value = await props.api<IntegrationReview>(`${root.value}/${connection.id}`);
      if (live) {
        review.value = value;
        message.value =
          action === "rotacionar"
            ? "Credencial rotacionada. Integração e operações permanecem desativadas; revise e publique nova skill/operação."
            : action === "suspender"
              ? "Integração suspensa. Isso não cancela chamadas já enviadas nem prova rollback."
              : "Suspensão removida. Publicações e concessões antigas não foram restauradas; uma nova publicação continua necessária.";
      }
    } catch (cause) {
      if (live) needsReview.value = true;
      throw cause;
    } finally {
      clearSecrets();
      confirmed.value = false;
    }
  });
}
async function create() {
  await run(async () => {
    try {
      const credential =
        form.type === "bearer"
          ? { credentialType: "bearer", token: form.token }
          : form.type === "api_key"
            ? { credentialType: "api_key", header: form.header, apiKey: form.apiKey }
            : { credentialType: "basic", username: form.username, password: form.password };
      const value = await props.api<{ id: string }>(root.value, {
        requestId: createId,
        confirmed: "create",
        registration: { name: form.name, kind: form.kind, destination: form.destination },
        owner: { email: form.ownerEmail, password: form.ownerPassword },
        credential,
      });
      if (!live) return;
      selected.value = value.id;
      clear(true);
      await load();
      const detail = await props.api<IntegrationReview>(`${root.value}/${value.id}`);
      if (live) {
        createId = "";
        review.value = detail;
        message.value =
          "Integração cadastrada e desativada. Selecione operações, treine e publique uma skill antes do uso.";
      }
    } catch (cause) {
      if (live) needsReview.value = true;
      throw cause;
    } finally {
      clearSecrets();
      confirmed.value = false;
    }
  });
}
onMounted(() => {
  let started = false;
  stop = watch(
    () => props.disabled,
    (disabled) => {
      if (!disabled && !started && live) {
        started = true;
        void run(load);
      }
    },
    { immediate: true, flush: "post" },
  );
});
</script>
<template>
  <section aria-label="Gestão das integrações">
    <h2>Gerenciar integrações</h2>
    <p>
      Estado local e credenciais pertencem a esta persona. Suspensão e rotação não desfazem efeitos
      já enviados. Nenhuma ação aqui executa testes ou ferramentas externas.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="busy || disabled">
      <button type="button" :disabled="needsReview" @click="begin('criar')">
        Cadastrar integração
      </button>
      <label
        >Integração a gerenciar<select :value="selected" @change="select">
          <option value="">Selecione</option>
          <option v-for="row in rows" :key="row.id" :value="row.id">
            {{ row.name }} · {{ row.kind }} ·
            {{
              row.suspendedAt ? "suspensa" : row.active ? "ativa localmente" : "aguarda publicação"
            }}
            · credencial v{{ row.version }}
          </option>
        </select></label
      >
      <button type="button" @click="refresh">Recarregar gestão de integrações</button>
      <p v-if="!rows.length">
        Nenhuma integração cadastrada. Cadastre uma conexão REST ou MCP remoto. Consumidores
        autorizados também podem solicitar um setup temporário.
      </p>
      <p v-if="needsReview">
        Confira a lista em Recarregar gestão de integrações antes de tentar novamente. Uma
        confirmação perdida pode já ter cadastrado a integração.
      </p>
      <template v-if="review">
        <p>
          Destino fixo: {{ review.connection.destination }} · credencial v{{
            review.connection.version
          }}
          · revisão de gestão {{ review.connection.managementVersion }}
        </p>
        <p>
          Operações habilitadas: {{ review.activeOperations }} · preparações, execuções ou
          resultados desconhecidos: {{ review.pendingOperations }}. Verifique os comprovantes;
          cancelamento e conciliação são separados.
        </p>
        <ul>
          <li v-for="publication in review.publications" :key="publication.publicationId">
            {{ publication.name }} · revisão {{ publication.revision }} ·
            {{ publication.suspended ? "publicação suspensa" : "publicação registrada" }}. Será
            mantida no histórico.
          </li>
        </ul>
        <button v-if="!review.connection.suspendedAt" type="button" @click="begin('suspender')">
          Revisar suspensão da integração
        </button>
        <button v-else type="button" @click="begin('recuperar')">
          Revisar recuperação da integração
        </button>
        <button type="button" @click="begin('rotacionar')">Revisar rotação de credenciais</button>
      </template>
      <form v-if="mode" aria-label="Confirmar mudança da integração" @submit.prevent="save">
        <template v-if="mode === 'criar'">
          <h3>Nova integração</h3>
          <p>
            O cadastro guarda a credencial cifrada. Não verifica o provedor nem habilita operações.
            Use um destino HTTPS público sem credenciais ou parâmetros na URL.
          </p>
          <label>Nome da integração<input v-model="form.name" required maxlength="200" /></label>
          <label
            >Tipo da integração<select v-model="form.kind">
              <option value="rest">REST</option>
              <option value="mcp_http">MCP remoto (Streamable HTTP)</option>
            </select></label
          >
          <label
            >Destino HTTPS da integração<input
              v-model="form.destination"
              type="url"
              required
              maxlength="2048"
              autocomplete="off"
          /></label>
        </template>
        <p v-if="mode !== 'criar'">
          Publicações dependentes e operações antigas permanecerão desativadas. Recuperar não
          restaura concessões. Rotacionar preserva nome, tipo, destino e eventual suspensão; não
          verifica a credencial no provedor.
        </p>
        <p v-if="mode && mode !== 'criar'" class="notice">
          Tokens existentes não receberão novos acessos. Consumidores das publicações acima perderão
          a disponibilidade desta integração; efeitos já executados não serão desfeitos. Revise as
          dependências e os comprovantes antes de confirmar.
        </p>
        <template v-if="mode === 'rotacionar' || mode === 'criar'">
          <label
            >E-mail do responsável para reautenticação<input
              v-model="form.ownerEmail"
              type="email"
              required
              autocomplete="username"
              maxlength="320"
          /></label>
          <label
            >Senha do responsável para reautenticação<input
              v-model="form.ownerPassword"
              type="password"
              required
              autocomplete="current-password"
              maxlength="1024"
          /></label>
          <label
            >Tipo da nova credencial<select v-model="form.type" @change="clearSecrets">
              <option value="bearer">Bearer</option>
              <option value="api_key">API key em header</option>
              <option value="basic">Basic</option>
            </select></label
          >
          <label v-if="form.type === 'bearer'"
            >Novo Bearer da integração<input
              v-model="form.token"
              type="password"
              autocomplete="off"
              required
              maxlength="8192"
          /></label>
          <template v-else-if="form.type === 'api_key'"
            ><label>Header da API key<input v-model="form.header" required maxlength="100" /></label
            ><label
              >Nova API key<input
                v-model="form.apiKey"
                type="password"
                autocomplete="off"
                required
                maxlength="8192" /></label
          ></template>
          <template v-else
            ><label
              >Usuário técnico Basic<input
                v-model="form.username"
                autocomplete="off"
                required
                maxlength="8192" /></label
            ><label
              >Nova senha técnica Basic<input
                v-model="form.password"
                type="password"
                autocomplete="off"
                required
                maxlength="8192" /></label
          ></template>
        </template>
        <label
          ><input v-model="confirmed" type="checkbox" />{{
            mode === "criar"
              ? "Revisei destino e credenciais e confirmo o cadastro sem operações ativas."
              : "Revisei o impacto e confirmo esta mudança da integração."
          }}</label
        >
        <p v-if="needsReview">
          A confirmação pode ter sido perdida ou o estado alterado. Recarregue e revise antes de
          outra mudança.
        </p>
        <button :disabled="!confirmed || needsReview">
          {{
            mode === "criar"
              ? "Confirmar cadastro da integração"
              : mode === "rotacionar"
                ? "Confirmar rotação de credenciais"
                : mode === "suspender"
                  ? "Confirmar suspensão da integração"
                  : "Confirmar recuperação da integração"
          }}
        </button>
        <button type="button" @click="clear()">Descartar mudança da integração</button>
      </form>
    </fieldset>
  </section>
</template>
