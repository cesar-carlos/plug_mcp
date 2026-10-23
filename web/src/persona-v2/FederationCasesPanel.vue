<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import {
  federationEditableCaseSchema,
  type FederationCase,
  type FederationPublicationCase,
  type FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import { emptyFederationCase } from "./federation-editor";
import OperationNameList from "./OperationNameList.vue";
import FederationRowsEditor from "./FederationRowsEditor.vue";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";

import { scalarTypes } from "./operation-editor";
import type { QueryDependency } from "./federation-editor";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  training: FederationTraining;
  publications: QueryDependency[];
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  save: [
    {
      id?: string;
      remove: boolean;
      required: boolean;
      content: FederationCase | FederationPublicationCase;
    },
  ];
}>();
const current = ref<FederationCase | FederationPublicationCase>(),
  id = ref(""),
  required = ref(true),
  saved = ref(""),
  removeConfirmed = ref(false),
  resetConfirmed = ref(false);
const mode = ref("transport");
const synthetic = computed(() =>
  current.value && "fixtures" in current.value.input
    ? (current.value as FederationCase)
    : undefined,
);
const native = computed(() =>
  current.value && "sources" in current.value.input
    ? (current.value as FederationPublicationCase)
    : undefined,
);
const nativeExpected = computed(() =>
  native.value && "rows" in native.value.expected ? native.value.expected : undefined,
);
function sourceTables(sourceId: string) {
  return props.publications
    .filter(
      (p) =>
        p.sourceId === sourceId &&
        props.training.steps.some((s) => s.kind === "local" && s.publicationId === p.id),
    )
    .flatMap((p) => p.training.tables);
}
function sourceColumns(sourceId: string, table: string) {
  return [
    ...new Set(
      props.publications
        .filter(
          (p) =>
            p.sourceId === sourceId &&
            props.training.steps.some((s) => s.kind === "local" && s.publicationId === p.id),
        )
        .flatMap((p) => p.training.columns.filter((c) => c.table === table).map((c) => c.name)),
    ),
  ];
}
function freshCase(): FederationCase | FederationPublicationCase {
  const basic = emptyFederationCase(props.training);
  if (mode.value === "synthetic") {
    return basic;
  }
  return {
    name: "",
    input: {
      plan: basic.input.plan,
      sources: [
        ...new Set(props.training.steps.filter((s) => s.kind === "local").map((s) => s.sourceId)),
      ].map((sourceId) => ({ sourceId, fixtures: [] })),
    },
    expected: { columns: [], rows: [], ordered: true, totalRows: 0 },
  };
}
function resetPlan() {
  if (!current.value || !resetConfirmed.value) {
    return;
  }
  const old = current.value;
  mode.value = native.value ? "transport" : "synthetic";
  current.value = { ...freshCase(), name: old.name };
  resetConfirmed.value = false;
}
function expectedChange(event: Event) {
  if (!current.value) {
    return;
  }
  const value = (event.target as HTMLSelectElement).value;
  current.value.expected =
    value === "success"
      ? native.value
        ? { columns: [], rows: [], ordered: true, totalRows: 0 }
        : emptyFederationCase(props.training).expected
      : { errorCode: value as "INVALID_PLAN" | "INCOMPLETE_INPUT" | "BUDGET_EXCEEDED" };
}
const { error, errorSummary } = useErrorSummary();
const fingerprint = computed(() =>
  JSON.stringify({ required: required.value, content: current.value }),
);
// An open case also protects a new unsaved case before its first keystroke.
watch(current, (v) => emit("dirty", !!v), { deep: true });
const changed = computed(() => !!current.value && fingerprint.value !== saved.value);
async function edit(test?: TrainingCase) {
  if (current.value && !(await props.confirmDiscard())) {
    return;
  }
  id.value = test?.id ?? "";
  required.value = test?.required ?? true;
  removeConfirmed.value = false;
  resetConfirmed.value = false;
  error.value = "";
  current.value = test
    ? (JSON.parse(JSON.stringify(test.content)) as FederationCase | FederationPublicationCase)
    : freshCase();
  saved.value = fingerprint.value;
}
async function close() {
  if (
    (changed.value || resetConfirmed.value || removeConfirmed.value) &&
    !(await props.confirmDiscard())
  ) {
    return;
  }
  current.value = undefined;
  removeConfirmed.value = false;
  error.value = "";
}
function submit(remove = false) {
  if (!current.value || (remove && !removeConfirmed.value)) {
    return;
  }
  const result = federationEditableCaseSchema.safeParse(current.value);
  if (!result.success) {
    error.value = "Revise SQL, parâmetros, entradas sintéticas e resultado esperado do caso.";
    return;
  }
  emit("save", {
    ...(id.value ? { id: id.value } : {}),
    remove,
    required: required.value,
    content: result.data,
  });
}
</script>
<template>
  <section aria-label="Casos do cruzamento">
    <h3>Casos de publicação do cruzamento</h3>
    <p>
      As entradas sintéticas testam a combinação; não comprovam dados reais nem os três motores. O
      runner de operador registra relatórios em ambiente isolado. Este formulário não executa SQL.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <fieldset :disabled="disabled">
      <ul>
        <li v-for="test in cases" :key="test.id">
          {{ (test.content as FederationCase).name }} ·
          {{ test.required ? "obrigatório" : "opcional"
          }}<button type="button" @click="edit(test)">
            Editar caso {{ (test.content as FederationCase).name }}
          </button>
        </li>
      </ul>
      <label
        >Tipo do novo caso<select v-model="mode">
          <option value="transport">SQL pelo transporte em fixtures isoladas</option>
          <option value="synthetic">Somente combinação sintética</option>
        </select></label
      >
      <button type="button" @click="edit()">Adicionar caso de cruzamento</button>
      <form v-if="current" aria-label="Editor de caso de cruzamento" @submit.prevent="submit()">
        <label
          >Nome do caso de cruzamento<input v-model="current.name" required maxlength="200"
        /></label>
        <label><input v-model="required" type="checkbox" />Caso obrigatório</label>
        <p>
          O plano e as projeções deste caso ficam fixados na edição. Mudanças no contrato exigem
          revisar o caso explicitamente; não serão incorporadas automaticamente.
        </p>
        <details>
          <summary>Refazer o caso após mudança do contrato</summary>
          <label
            ><input v-model="resetConfirmed" type="checkbox" />Confirmo descartar SQL, entradas e
            resultados locais deste caso e usar o plano atual do rascunho.</label
          ><button type="button" :disabled="!resetConfirmed" @click="resetPlan">
            Refazer plano e entradas do caso
          </button>
        </details>
        <div
          v-for="step in current.input.plan.steps.filter((s) => s.kind === 'local')"
          :key="step.id"
        >
          <h4>Consulta local {{ step.id }}</h4>
          <label
            >SQL sintético de {{ step.id
            }}<textarea v-model="step.sql" required maxlength="30000" />
          </label>
          <OperationNameList
            :model-value="Object.keys(step.params)"
            :label="`Nomes dos parâmetros de ${step.id}`"
            @update:model-value="
              step.params = Object.fromEntries(
                $event.map((name) => [name, name in step.params ? step.params[name]! : '']),
              )
            "
          />
          <FederationRowsEditor
            :model-value="[step.params]"
            :columns="Object.keys(step.params)"
            :label="`Parâmetros de ${step.id}`"
            single
            @update:model-value="step.params = $event[0]!"
          />
        </div>
        <div v-for="fixture in synthetic?.input.fixtures ?? []" :key="fixture.stepId">
          <h4>Entrada {{ fixture.stepId }}</h4>
          <p>Colunas na ordem: {{ fixture.columns.join(", ") }}</p>
          <label
            ><input v-model="fixture.truncated" type="checkbox" />Entrada
            {{ fixture.stepId }} truncada</label
          >
          <FederationRowsEditor
            v-model="fixture.rows"
            :columns="fixture.columns"
            :label="`Entrada ${fixture.stepId}`"
          />
        </div>
        <template v-if="native">
          <fieldset v-for="source in native.input.sources" :key="source.sourceId">
            <legend>
              Sementes da base
              {{
                publications.find((p) => p.sourceId === source.sourceId)?.sourceName ??
                "dependência indisponível"
              }}
            </legend>
            <p>
              Estas sementes são destinadas apenas à fixture declarada pelo operador. O console não
              escreve na base cadastrada.
            </p>
            <fieldset v-for="(table, i) in source.fixtures" :key="i">
              <legend>Tabela sintética {{ i + 1 }}</legend>
              <label
                >Tabela da semente<select v-model="table.table" required>
                  <option value="">Selecione</option>
                  <option
                    v-for="name in [
                      ...new Set([
                        ...sourceTables(source.sourceId).map((t) => t.name),
                        ...(table.table ? [table.table] : []),
                      ]),
                    ]"
                    :key="name"
                    :value="name"
                  >
                    {{ name }}
                  </option>
                </select></label
              >
              <OperationNameList
                :model-value="table.generated ?? []"
                label="Colunas geradas da semente"
                @update:model-value="table.generated = $event"
              />
              <FederationTypedRowsEditor
                v-model="table.rows"
                :columns="sourceColumns(source.sourceId, table.table)"
                :label="`Sementes de ${table.table}`"
              />
              <button type="button" @click="source.fixtures.splice(i, 1)">
                Remover tabela da semente {{ i + 1 }}
              </button>
            </fieldset>
            <button
              type="button"
              :disabled="source.fixtures.length >= 16"
              @click="source.fixtures.push({ table: '', generated: [], rows: [] })"
            >
              Adicionar tabela de semente
            </button>
          </fieldset>
        </template>
        <label
          >Página do caso<input
            v-model.number="current.input.plan.page"
            type="number"
            min="1"
            max="1000000"
            required
        /></label>
        <label
          >Linhas por página do caso<input
            v-model.number="current.input.plan.pageSize"
            type="number"
            min="1"
            max="10000"
            required
        /></label>
        <label
          >Resultado esperado do cruzamento<select
            :value="'errorCode' in current.expected ? current.expected.errorCode : 'success'"
            @change="expectedChange"
          >
            <option value="success">Linhas e total</option>
            <option value="INVALID_PLAN">Plano inválido</option>
            <option value="INCOMPLETE_INPUT">Entrada incompleta</option>
            <option value="BUDGET_EXCEEDED">Limite excedido</option>
          </select></label
        >
        <template v-if="synthetic && 'rows' in synthetic.expected">
          <OperationNameList
            v-model="synthetic.expected.columns"
            label="Colunas esperadas na ordem"
          />
          <FederationRowsEditor
            v-model="synthetic.expected.rows"
            :columns="synthetic.expected.columns"
            label="Resultado esperado"
          />
          <label
            >Total esperado antes da paginação<input
              v-model.number="synthetic.expected.totalRows"
              type="number"
              min="0"
              required
          /></label>
        </template>
        <template v-if="nativeExpected">
          <h4>Colunas e tipos do resultado esperado</h4>
          <div v-for="(column, i) in nativeExpected.columns" :key="i">
            <label
              >Nome da coluna esperada {{ i + 1
              }}<input v-model="column.name" required pattern="[a-z_][a-z0-9_]*"
            /></label>
            <label
              >Tipo da coluna esperada {{ i + 1
              }}<select v-model="column.type">
                <option v-for="type in scalarTypes" :key="type" :value="type">{{ type }}</option>
              </select></label
            >
            <button type="button" @click="nativeExpected.columns.splice(i, 1)">
              Remover coluna esperada {{ i + 1 }}
            </button>
          </div>
          <button
            type="button"
            :disabled="nativeExpected.columns.length >= 100"
            @click="nativeExpected.columns.push({ name: '', type: 'string' })"
          >
            Adicionar coluna esperada
          </button>
          <FederationTypedRowsEditor
            v-model="nativeExpected.rows"
            :columns="nativeExpected.columns.map((c) => c.name)"
            label="Resultado tipado esperado"
          />
          <label
            ><input v-model="nativeExpected.ordered" type="checkbox" />Comparar ordem dos
            registros</label
          >
          <label
            >Total esperado antes da paginação<input
              v-model.number="nativeExpected.totalRows"
              type="number"
              min="0"
              max="10000"
              required
          /></label>
        </template>
        <details>
          <summary>Plano fixado do caso</summary>
          <pre>{{ JSON.stringify(current.input.plan, null, 2) }}</pre>
        </details>
        <p v-if="changed">Há alterações não salvas no caso.</p>
        <button>Salvar caso de cruzamento</button
        ><button type="button" @click="close">Fechar caso de cruzamento</button>
        <template v-if="id"
          ><label
            ><input v-model="removeConfirmed" type="checkbox" />Confirmo remover este caso e
            invalidar relatórios e prévias.</label
          ><button type="button" :disabled="!removeConfirmed" @click="submit(true)">
            Remover caso de cruzamento
          </button></template
        >
      </form>
    </fieldset>
  </section>
</template>
