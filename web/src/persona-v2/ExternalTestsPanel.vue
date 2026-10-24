<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onMounted } from "vue";
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import type { ExternalTestReport } from "../../../src/domain/persona-v2/external-run";
import { useErrorSummary } from "./useErrorSummary";
import ExternalTestFields from "./ExternalTestFields.vue";
import {
  editExternalValues,
  readExternalValues,
  type ExternalTestValue,
} from "./external-test-values";
interface Skill {
  skillId: string;
  name: string;
  revision: number;
  effect: string;
}
interface TestCase {
  id: string;
  required: boolean;
  content: {
    name: string;
    input: Record<string, string | number | boolean>;
    expected: Record<string, string | number | boolean>;
  };
}
interface Details {
  skillId: string;
  name: string;
  revision: number;
  packageHash: string;
  casesHash: string;
  ownerId: string;
  contract: ExternalContract;
  cases: TestCase[];
  requiredApproved: boolean;
  reports: (ExternalTestReport & { current: boolean })[];
  nextCursor: string | null;
}
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  skillId?: string;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; updated: [Details] }>();
const skills = ref<Skill[]>([]),
  details = ref<Details>(),
  busy = ref(false),
  message = ref(""),
  name = ref(""),
  required = ref(true),
  caseId = ref(""),
  removeConfirmed = ref(false),
  editing = ref(false),
  saved = ref("");
const input = ref<Record<string, ExternalTestValue>>({}),
  expected = ref<Record<string, ExternalTestValue>>({});
const { error, errorSummary } = useErrorSummary();
const fingerprint = computed(() =>
  JSON.stringify({
    name: name.value,
    required: required.value,
    input: input.value,
    expected: expected.value,
  }),
);
const dirty = computed(
  () => (editing.value && fingerprint.value !== saved.value) || removeConfirmed.value,
);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
const root = computed(() => `${props.base}/integracoes/skills`);
let live = true,
  initialized = false;
onBeforeUnmount(() => {
  live = false;
  input.value = {};
  expected.value = {};
  details.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
async function run(fn: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await fn();
  } catch (e) {
    if (live) error.value = e instanceof Error ? e.message : "Testes indisponíveis.";
  } finally {
    busy.value = false;
    if (live) emit("lock", false);
  }
}
async function load() {
  if (props.skillId) {
    const result = await props.api<Details>(`${root.value}/${props.skillId}/testes`);
    if (live) {
      details.value = result;
      emit("updated", result);
    }
    return;
  }
  const result = await props.api<{ skills: Skill[] }>(root.value);
  if (live) skills.value = result.skills;
}
async function refreshTests() {
  if (busy.value || props.disabled) {
    return;
  }
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(async () => {
    await load();
    if (live) {
      reset();
    }
  });
}
function reset() {
  editing.value = false;
  name.value = "";
  caseId.value = "";
  input.value = {};
  expected.value = {};
  removeConfirmed.value = false;
  saved.value = fingerprint.value;
}
async function select(id: string) {
  if (busy.value || props.disabled) return;
  if (dirty.value && !(await props.confirmDiscard())) return;
  await run(async () => {
    const result = await props.api<Details>(`${root.value}/${id}/testes`);
    if (!live) return;
    details.value = result;
    emit("updated", result);
    reset();
  });
}
async function edit(test?: TestCase) {
  if (!details.value || busy.value || props.disabled) return;
  if (dirty.value && !(await props.confirmDiscard())) return;
  name.value = test?.content.name ?? "";
  required.value = test?.required ?? true;
  caseId.value = test?.id ?? "";
  input.value = editExternalValues(details.value.contract.input, test?.content.input);
  expected.value = editExternalValues(details.value.contract.output, test?.content.expected);
  saved.value = fingerprint.value;
  removeConfirmed.value = false;
  editing.value = true;
}
async function save(remove = false) {
  const d = details.value;
  if (!d || !editing.value || (remove && !removeConfirmed.value)) return;
  await run(async () => {
    const content = remove
      ? d.cases.find((c) => c.id === caseId.value)!.content
      : {
          name: name.value,
          input: readExternalValues(d.contract.input, input.value),
          expected: readExternalValues(d.contract.output, expected.value),
        };
    await props.api(`${root.value}/${d.skillId}/casos`, {
      expectedRevision: d.revision,
      ...(caseId.value ? { id: caseId.value } : {}),
      remove,
      required: required.value,
      content,
    });
    if (!live) return;
    reset();
    const updated = await props.api<Details>(`${root.value}/${d.skillId}/testes`);
    if (!live) return;
    details.value = updated;
    emit("updated", updated);
    message.value = remove
      ? "Caso removido. Execute nova rodada isolada."
      : "Caso salvo. Relatórios anteriores não aprovam esta revisão.";
  });
}
async function more() {
  const d = details.value;
  if (!d?.nextCursor) return;
  await run(async () => {
    const result = await props.api<Details>(
      `${root.value}/${d.skillId}/testes?after=${encodeURIComponent(d.nextCursor!)}`,
    );
    if (!live) return;
    if (
      result.revision !== d.revision ||
      result.packageHash !== d.packageHash ||
      result.casesHash !== d.casesHash
    )
      throw new Error("Conteúdo mudou. Recarregue os relatórios antes de continuar.");
    details.value = { ...result, reports: [...d.reports, ...result.reports] };
  });
}
function initialize() {
  if (!props.disabled && !initialized && live) {
    initialized = true;
    void run(load);
  }
}
onMounted(initialize);
watch(() => props.disabled, initialize, { flush: "post" });
</script>
<template>
  <section aria-label="Casos e relatórios externos">
    <h2>Casos e relatórios de integrações</h2>
    <p>
      Use somente dados sintéticos. O operador executa os testes em fixture isolada; este painel não
      envia ações ao serviço.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <button class="secondary" :disabled="busy || disabled" @click="refreshTests">
      Atualizar skills externas
    </button>
    <p v-if="!skillId && !skills.length">Nenhuma skill externa cadastrada.</p>
    <ul>
      <li v-for="skill in skills" :key="skill.skillId">
        <button class="secondary" :disabled="busy || disabled" @click="select(skill.skillId)">
          {{ skill.name }} · revisão {{ skill.revision }}
        </button>
      </li>
    </ul>
    <section v-if="details" aria-label="Testes da skill externa">
      <h3>{{ details.name }} · revisão {{ details.revision }}</h3>
      <p>
        {{
          details.requiredApproved
            ? "Relatório técnico atual aprovado. Revisão semântica e publicação são ações separadas."
            : "Sem relatório atual aprovado. Execute os casos obrigatórios em fixture isolada."
        }}
      </p>
      <button :disabled="busy || disabled" @click="edit()">Adicionar caso externo</button>
      <ul>
        <li v-for="test in details.cases" :key="test.id">
          <strong>{{ test.content.name }}</strong> ·
          {{ test.required ? "Obrigatório" : "Opcional" }}
          <button class="secondary" :disabled="busy || disabled" @click="edit(test)">
            Editar caso {{ test.content.name }}
          </button>
        </li>
      </ul>
      <form v-if="editing" aria-label="Editor de caso externo" @submit.prevent="save()">
        <label
          >Nome do caso<input v-model="name" required maxlength="200" :disabled="busy || disabled"
        /></label>
        <label
          ><input v-model="required" type="checkbox" :disabled="busy || disabled" />Caso
          obrigatório</label
        >
        <ExternalTestFields
          v-model="input"
          :fields="details.contract.input"
          prefix="Entrada"
          :disabled="busy || disabled"
        />
        <ExternalTestFields
          v-model="expected"
          :fields="details.contract.output"
          prefix="Saída esperada"
          :disabled="busy || disabled"
        />
        <p v-if="dirty">Há alterações não salvas.</p>
        <button :disabled="busy || disabled">Salvar caso externo</button>
        <button
          type="button"
          :disabled="busy || disabled"
          @click="
            async () => {
              if (!dirty || (await confirmDiscard())) {
                reset();
              }
            }
          "
        >
          Fechar caso externo
        </button>
        <template v-if="caseId"
          ><label
            ><input
              v-model="removeConfirmed"
              type="checkbox"
              :disabled="busy || disabled"
            />Confirmo remover este caso</label
          ><button
            type="button"
            class="danger"
            :disabled="busy || disabled || !removeConfirmed"
            @click="save(true)"
          >
            Remover caso externo
          </button></template
        >
      </form>
      <h4>Relatórios técnicos</h4>
      <p v-if="!details.reports.length">
        Nenhuma rodada registrada. Ausência de relatório não prova ausência de testes antigos.
      </p>
      <ul>
        <li v-for="report in details.reports" :key="report.id">
          <strong>{{
            report.current ? "Conteúdo atual" : "Obsoleto — não libera publicação"
          }}</strong>
          · {{ report.approved ? "Aprovado tecnicamente" : "Não aprovado" }} ·
          {{ new Date(report.createdAt).toLocaleString() }}
          <p v-if="report.runState === 'unknown'">
            Rodada incerta. Não repita efeitos; solicite investigação ao operador.
          </p>
          <p v-if="report.runState === 'running'">
            Rodada ainda em execução ou interrompida. Não inicie outra no mesmo destino.
          </p>
          <p>
            Revisão {{ report.revision }} · {{ report.results.filter((r) => r.passed).length }} de
            {{ report.results.length }} casos aprovados
          </p>
          <details>
            <summary>Casos e identificação da rodada</summary>
            <p v-for="result in report.results" :key="result.id">
              Caso {{ result.id }}: {{ result.passed ? "passou" : "falhou" }}
            </p>
            <p>
              Runner {{ report.runnerId }} · rodada
              {{ report.runId ?? "registro anterior sem rodada vinculada" }}
            </p>
            <p>Hash {{ report.packageHash }}</p>
          </details>
        </li>
      </ul>
      <button
        v-if="details.nextCursor"
        class="secondary"
        :disabled="busy || disabled"
        @click="more"
      >
        Carregar mais relatórios
      </button>
      <details>
        <summary>Vínculo técnico para o operador</summary>
        <p>
          O manifesto fixa estes valores e uma integração de fixture separada. Nenhuma credencial
          deve ser incluída.
        </p>
        <pre>{{
          JSON.stringify(
            {
              personaId: base.split("/").at(-1),
              ownerId: details.ownerId,
              skillId: details.skillId,
              revision: details.revision,
              packageHash: details.packageHash,
              casesHash: details.casesHash,
            },
            null,
            2,
          )
        }}</pre>
      </details>
    </section>
  </section>
</template>
