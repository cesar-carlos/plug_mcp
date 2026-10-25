<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import type { Source } from "./model";
import type { SourcePublicationImpact } from "../../../src/domain/persona-v2/model";

const props = defineProps<{
  source: Source;
  busy: boolean;
  base: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{
  state: [active: boolean, input: unknown];
  replace: [];
  reload: [];
  dirty: [value: boolean];
  lock: [value: boolean];
}>();
type Action = "suspender" | "recuperar" | "substituir";
const expectedVersion = props.source.authorizationVersion;
const pending = ref<Action>();
const reviewing = ref(false);
const impact = ref<SourcePublicationImpact>();
const confirmed = ref(false),
  error = ref("");
const updateCredential = ref(false);
const credentials = reactive({ email: "", password: "", clientToken: "" });
const summary = ref<HTMLElement>();
let live = true;
onBeforeUnmount(() => {
  live = false;
});
const dirty = computed(() => !!pending.value || Object.values(credentials).some(Boolean));
watch(dirty, (value) => emit("dirty", value), { immediate: true });
watch(
  () => JSON.stringify({ credentials, update: updateCredential.value }),
  () => {
    confirmed.value = false;
  },
);
function clearCredentials() {
  Object.assign(credentials, { email: "", password: "", clientToken: "" });
  updateCredential.value = false;
}
async function review(action: Action) {
  if (props.busy || reviewing.value) return;
  reviewing.value = true;
  pending.value = undefined;
  impact.value = undefined;
  confirmed.value = false;
  error.value = "";
  clearCredentials();
  emit("lock", true);
  try {
    const result = await props.api<SourcePublicationImpact & { sourceVersion: number }>(
      `${props.base}/fontes/${props.source.id}/impacto?expectedVersion=${expectedVersion}`,
    );
    if (!live) return;
    if (result.sourceVersion !== expectedVersion)
      throw new Error("Fonte mudou; recarregue antes de continuar.");
    impact.value = result;
    pending.value = action;
    await nextTick();
    summary.value?.focus();
  } catch (cause) {
    if (live) {
      error.value = cause instanceof Error ? cause.message : "Não foi possível revisar a fonte.";
      await nextTick();
      summary.value?.focus();
    }
  } finally {
    reviewing.value = false;
    if (live) emit("lock", false);
  }
}
function confirm() {
  if (props.busy || !confirmed.value || !impact.value || !pending.value) return;
  const action = pending.value;
  const input = {
    expectedVersion,
    ...(action === "recuperar" && updateCredential.value
      ? { credentials: { ...credentials } }
      : {}),
  };
  pending.value = undefined;
  impact.value = undefined;
  confirmed.value = false;
  clearCredentials();
  if (action === "substituir") emit("replace");
  else emit("state", action === "recuperar", input);
}
</script>

<template>
  <section :aria-label="`Ciclo da base ${source.name}`" :aria-busy="reviewing || busy">
    <p v-if="reviewing" role="status">Conferindo o impacto sobre os acessos…</p>
    <p v-if="source.replacedBySourceId" class="notice">
      Vínculo substituído e mantido no histórico. A base substituta tem cadastro, treinamento e
      permissões próprios.
      <span>Identificador da substituta: {{ source.replacedBySourceId }}</span>
    </p>
    <template v-else>
      <p v-if="source.authorizationVersion !== expectedVersion" class="notice">
        A fonte mudou. Sua revisão foi preservada; recarregue o vínculo antes de continuar.
      </p>
      <div class="actions">
        <button type="button" :disabled="busy" @click="emit('reload')">Recarregar vínculo</button>
        <button v-if="source.active" type="button" :disabled="busy" @click="review('suspender')">
          Revisar suspensão
        </button>
        <button v-else type="button" :disabled="busy" @click="review('recuperar')">
          Revisar recuperação
        </button>
        <button type="button" :disabled="busy" @click="review('substituir')">
          Revisar substituição
        </button>
      </div>
      <div v-if="pending || error" ref="summary" tabindex="-1">
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <form
          v-if="pending && impact"
          :aria-label="`Confirmar ${pending} base ${source.name}`"
          @submit.prevent="confirm"
        >
          <h3>Revisar {{ pending }} base</h3>
          <p v-if="pending === 'suspender'">
            Suspender bloqueia esta fonte e suspende suas publicações e cruzamentos dependentes.
            Efeitos já executados não são desfeitos.
          </p>
          <p v-else-if="pending === 'recuperar'">
            Recuperar exige confirmação da mesma base pelo plug_server e plug_agente. Publicações
            continuam suspensas; revise e publique novamente. Operações incertas não serão
            reenviadas.
          </p>
          <p v-else>
            Substituir cria um novo vínculo após verificar a nova base. O vínculo anterior fica no
            histórico e não poderá ser recuperado. Treinamento, tokens e permissões não serão
            transferidos.
          </p>
          <p>
            {{ impact.total }} publicação(ões) vinculada(s), incluindo versões anteriores e
            dependências.
          </p>
          <ul>
            <li v-for="p in impact.publications" :key="p.publicationId">
              {{ p.name }} · revisão {{ p.revision }} ·
              {{ p.suspended ? "Já suspensa" : p.active ? "Será suspensa" : "Versão anterior" }}
            </li>
          </ul>
          <p v-if="impact.total > impact.publications.length">
            A lista mostra somente as primeiras dependências; a ação protege todas as afetadas.
          </p>
          <fieldset :disabled="busy">
            <template v-if="pending === 'recuperar'">
              <label
                ><input v-model="updateCredential" type="checkbox" />Informar novas credenciais para
                a mesma base</label
              >
              <template v-if="updateCredential">
                <label
                  >E-mail da base<input
                    v-model="credentials.email"
                    type="email"
                    autocomplete="off"
                    required
                    maxlength="320"
                /></label>
                <label
                  >Senha da base<input
                    v-model="credentials.password"
                    type="password"
                    autocomplete="new-password"
                    required
                    maxlength="1024"
                /></label>
                <label
                  >Token técnico da base<input
                    v-model="credentials.clientToken"
                    type="password"
                    autocomplete="off"
                    required
                    maxlength="8192"
                /></label>
              </template>
            </template>
            <label
              ><input v-model="confirmed" type="checkbox" />Revisei os efeitos desta ação sobre a
              base e suas publicações.</label
            >
            <button type="submit" :disabled="!confirmed">
              {{
                pending === "substituir"
                  ? "Preencher nova base substituta"
                  : pending === "recuperar"
                    ? "Confirmar recuperação"
                    : "Confirmar suspensão"
              }}
            </button>
            <button
              type="button"
              @click="
                pending = undefined;
                impact = undefined;
                clearCredentials();
              "
            >
              Continuar sem alterar
            </button>
          </fieldset>
        </form>
      </div>
    </template>
  </section>
</template>
