<script setup lang="ts">
import { computed, reactive, watch, ref, nextTick, onBeforeUnmount } from "vue";
import type { Source, SourceRestriction } from "./model";
import type { SourcePublicationImpact } from "../../../src/domain/persona-v2/model";

const props = defineProps<{
  source: Source;
  busy: boolean;
  base: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{
  save: [
    input: {
      expectedVersion: number;
      name: string;
      purpose: string;
      environment: string;
      rowRestrictions: SourceRestriction[];
    },
  ];
  rotate: [
    input: { expectedVersion: number; email: string; password: string; clientToken: string },
  ];
  dirty: [value: boolean];
  reload: [];
  lock: [value: boolean];
}>();
const impact = ref<SourcePublicationImpact>();
const pending = ref<"save" | "rotate">();
const confirmed = ref(false),
  error = ref("");
const errorSummary = ref<HTMLElement>();
let live = true;
onBeforeUnmount(() => {
  live = false;
});
// A background refresh cannot silently change the version of an unsaved form.
const expectedVersion = props.source.authorizationVersion;
const form = reactive({
  name: props.source.name,
  purpose: props.source.purpose,
  environment: props.source.environment,
});
const restrictions = reactive(
  (props.source.rowRestrictions ?? []).map((r) => ({
    ...r,
    value: String(r.value),
    type: typeof r.value,
  })),
);
const credentials = reactive({ email: "", password: "", clientToken: "" });
const initial = JSON.stringify({ form, restrictions });
const dirty = computed(
  () =>
    JSON.stringify({ form, restrictions }) !== initial || Object.values(credentials).some(Boolean),
);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
watch(
  () => JSON.stringify({ form, restrictions, credentials }),
  () => {
    impact.value = undefined;
    pending.value = undefined;
    confirmed.value = false;
  },
);
async function review(action: "save" | "rotate") {
  if (props.busy) return;
  error.value = "";
  impact.value = undefined;
  pending.value = undefined;
  confirmed.value = false;
  emit("lock", true);
  try {
    const response = await props.api<SourcePublicationImpact & { sourceVersion: number }>(
      `${props.base}/fontes/${props.source.id}/impacto?expectedVersion=${expectedVersion}`,
    );
    if (!live) return;
    if (response.sourceVersion !== expectedVersion)
      throw new Error("Cadastro mudou. Recarregue a base antes de salvar.");
    impact.value = response;
    pending.value = action;
    await nextTick();
    document.getElementById(`source-impact-${props.source.id}`)?.focus();
  } catch (cause) {
    if (live) {
      error.value = cause instanceof Error ? cause.message : "Não foi possível conferir o impacto.";
      Object.assign(credentials, { email: "", password: "", clientToken: "" });
      await nextTick();
      errorSummary.value?.focus();
    }
  } finally {
    emit("lock", false);
  }
}
function confirmChange() {
  if (props.busy || !confirmed.value || !impact.value) return;
  const action = pending.value;
  impact.value = undefined;
  pending.value = undefined;
  confirmed.value = false;
  if (action === "save") save();
  if (action === "rotate") rotate();
}
function save() {
  emit("save", {
    ...form,
    expectedVersion,
    rowRestrictions: restrictions.map((r) => ({
      table: r.table,
      column: r.column,
      parameter: r.parameter,
      value:
        r.type === "boolean" ? r.value === "true" : r.type === "number" ? Number(r.value) : r.value,
    })),
  });
}
function rotate() {
  // Copy for the request and immediately discard secrets from the editable browser state.
  emit("rotate", { ...credentials, expectedVersion });
  Object.assign(credentials, { email: "", password: "", clientToken: "" });
}
</script>

<template>
  <p v-if="!source.active" class="notice">
    {{
      source.replacedBySourceId
        ? "Cadastro anterior preservado no histórico."
        : "Base suspensa. Revise a recuperação ou substituição abaixo."
    }}
  </p>
  <details v-else>
    <summary>Gerenciar {{ source.name }}</summary>
    <p>
      Agente: {{ source.agentId }} · Banco confirmado: {{ source.database }} · {{ source.dialect }}
    </p>
    <p v-if="source.authorizationVersion !== expectedVersion" class="notice">
      O cadastro mudou. Sua edição foi preservada; recarregue a base para revisar a versão atual.
    </p>
    <button type="button" :disabled="busy" @click="emit('reload')">Recarregar base</button>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <form :aria-label="`Editar base ${source.name}`" @submit.prevent="review('save')">
      <fieldset :disabled="busy">
        <label>Nome da base<input v-model="form.name" maxlength="200" required /></label>
        <label>Finalidade<textarea v-model="form.purpose" maxlength="5000" required /></label>
        <label>Ambiente<input v-model="form.environment" maxlength="100" required /></label>
        <h3>Recortes obrigatórios</h3>
        <p>O treinamento deve aplicar estes filtros em todas as consultas da tabela.</p>
        <div v-for="(r, i) in restrictions" :key="i" class="row">
          <label>Tabela<input v-model="r.table" required /></label>
          <label>Coluna<input v-model="r.column" required /></label>
          <label
            >Parâmetro reservado<input
              v-model="r.parameter"
              pattern="__scope_[a-z][a-z0-9_]*"
              required
          /></label>
          <label
            >Tipo<select v-model="r.type">
              <option value="string">Texto</option>
              <option value="number">Número</option>
              <option value="boolean">Booleano</option>
            </select></label
          >
          <label
            >Valor<select v-if="r.type === 'boolean'" v-model="r.value" required>
              <option value="true">Sim</option>
              <option value="false">Não</option></select
            ><input
              v-else
              v-model="r.value"
              :type="r.type === 'number' ? 'number' : 'text'"
              :step="r.type === 'number' ? 'any' : undefined"
              required
          /></label>
          <button
            type="button"
            :aria-label="`Remover recorte ${i + 1}`"
            @click="restrictions.splice(i, 1)"
          >
            Remover
          </button>
        </div>
        <button
          type="button"
          :disabled="restrictions.length >= 64"
          @click="
            restrictions.push({
              table: '',
              column: '',
              parameter: '__scope_',
              value: '',
              type: 'string',
            })
          "
        >
          Adicionar recorte
        </button>
        <p class="notice">
          Salvar suspende as publicações desta fonte e os cruzamentos dependentes. Revise e publique
          novamente para voltar a consultar.
        </p>
        <button :disabled="JSON.stringify({ form, restrictions }) === initial">Salvar base</button>
      </fieldset>
    </form>
    <details>
      <summary>Trocar credenciais</summary>
      <form :aria-label="`Trocar credenciais de ${source.name}`" @submit.prevent="review('rotate')">
        <fieldset :disabled="busy">
          <label
            >CLIENT_EMAIL<input
              v-model="credentials.email"
              type="email"
              autocomplete="off"
              required
          /></label>
          <label
            >CLIENT_PASSWORD<input
              v-model="credentials.password"
              type="password"
              autocomplete="off"
              required
          /></label>
          <label
            >CLIENT_TOKEN<input
              v-model="credentials.clientToken"
              type="password"
              autocomplete="off"
              required
          /></label>
          <p>
            As credenciais serão verificadas pelo plug_server e plug_agente. A troca exige a mesma
            base e suspende o treinamento dependente até nova publicação.
          </p>
          <button>Verificar e trocar credenciais</button>
        </fieldset>
      </form>
    </details>
    <section v-if="impact && pending" :aria-labelledby="`source-impact-${source.id}`">
      <h3 :id="`source-impact-${source.id}`" tabindex="-1">Revisar impacto em {{ source.name }}</h3>
      <p v-if="!impact.total">Nenhuma publicação depende desta base neste momento.</p>
      <p v-else>
        {{ impact.total }} publicação(ões) afetada(s), incluindo dependências transitivas e versões
        anteriores.
      </p>
      <ul>
        <li v-for="p in impact.publications" :key="p.publicationId">
          {{ p.name }} · revisão {{ p.revision }} · {{ p.kind }} ·
          {{ p.direct ? "Usa esta base" : "Dependência transitiva" }} ·
          {{ p.suspended ? "Já suspensa" : p.active ? "Será suspensa" : "Versão anterior" }}
        </li>
      </ul>
      <p v-if="impact.total > impact.publications.length" class="notice">
        Mostrando {{ impact.publications.length }} de {{ impact.total }} publicações. A alteração
        suspende todas as afetadas.
      </p>
      <p>
        Esta revisão reflete o estado atual. Novas publicações dependentes também serão suspensas ao
        salvar. Revise, teste e publique novamente antes de consultar.
      </p>
      <label
        ><input v-model="confirmed" type="checkbox" :disabled="busy" />Entendi o impacto desta
        alteração</label
      >
      <button type="button" :disabled="busy || !confirmed" @click="confirmChange">
        {{
          pending === "rotate" ? "Confirmar troca de credenciais" : "Confirmar alteração da base"
        }}
      </button>
      <button
        type="button"
        class="secondary"
        :disabled="busy"
        @click="
          impact = undefined;
          pending = undefined;
          confirmed = false;
        "
      >
        Continuar editando
      </button>
    </section>
  </details>
</template>
