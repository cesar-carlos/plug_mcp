<script setup lang="ts">
import { ref } from "vue";
import type { TrainingStep, QueryDependency } from "./federation-editor";
import { newStep, stepColumns } from "./federation-editor";
import OperationNameList from "./OperationNameList.vue";

const props = defineProps<{ modelValue: TrainingStep[]; publications: QueryDependency[] }>();
const emit = defineEmits<{ "update:modelValue": [TrainingStep[]] }>();
const kind = ref<TrainingStep["kind"]>("local");
const labels = {
  local: "Consulta local",
  join: "Relacionar",
  union: "Unir linhas",
  project: "Projetar campos",
  aggregate: "Agregar",
  sort: "Ordenar",
};
function add() {
  let n = 1;
  while (props.modelValue.some((s) => s.id === `step_${n}`)) {
    n++;
  }
  emit("update:modelValue", [...props.modelValue, newStep(kind.value, `step_${n}`)]);
}
function move(index: number, offset: number) {
  const steps = [...props.modelValue];
  const target = index + offset;
  if (target < 0 || target >= steps.length) {
    return;
  }
  [steps[index], steps[target]] = [steps[target], steps[index]];
  emit("update:modelValue", steps);
}
function dependency(step: Extract<TrainingStep, { kind: "local" }>, event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  const publication = props.publications.find((p) => p.id === id);
  step.publicationId = id;
  step.sourceId = publication?.sourceId ?? "";
}
</script>
<template>
  <fieldset>
    <legend>Etapas do cruzamento</legend>
    <p>
      Selecione pelo menos duas bases com consultas publicadas. Referências usam somente etapas
      anteriores. Alterar a ordem ou uma publicação exige revisar casos e dependências.
    </p>
    <article v-for="(step, i) in modelValue" :key="i" :aria-label="`Etapa ${i + 1}`">
      <h4>{{ i + 1 }}. {{ labels[step.kind] }}</h4>
      <label
        >Identificador da etapa<input
          v-model="step.id"
          required
          pattern="[a-z][a-z0-9_]*"
          maxlength="100"
      /></label>
      <button type="button" :disabled="i === 0" @click="move(i, -1)">
        Subir etapa {{ i + 1 }}
      </button>
      <button type="button" :disabled="i === modelValue.length - 1" @click="move(i, 1)">
        Descer etapa {{ i + 1 }}
      </button>
      <button
        type="button"
        @click="
          emit(
            'update:modelValue',
            modelValue.filter((_, n) => n !== i),
          )
        "
      >
        Remover etapa {{ i + 1 }}
      </button>
      <template v-if="step.kind === 'local'">
        <label
          >Consulta publicada<select
            :value="step.publicationId"
            required
            @change="dependency(step, $event)"
          >
            <option value="">Selecione</option>
            <option
              v-if="step.publicationId && !publications.some((p) => p.id === step.publicationId)"
              :value="step.publicationId"
            >
              Publicação anterior indisponível — escolha explicitamente outra
            </option>
            <option v-for="p in publications" :key="p.id" :value="p.id">
              {{ p.sourceName }} · {{ p.name }} · revisão {{ p.revision }} · {{ p.dialect }}
            </option>
          </select></label
        >
        <OperationNameList
          v-model="step.columns"
          label="Colunas retornadas pela consulta (na ordem)"
        />
        <p>
          Declare as projeções e aliases que o SQL do caso deverá retornar. Escolher outra
          publicação não reescreve colunas ou SQL.
        </p>
      </template>
      <template v-else-if="step.kind === 'join'">
        <label
          >Etapa esquerda<select v-model="step.left" required>
            <option value="">Selecione</option>
            <option v-for="s in modelValue.slice(0, i)" :key="s.id" :value="s.id">
              {{ s.id }}
            </option>
            <option
              v-if="step.left && !modelValue.slice(0, i).some((s) => s.id === step.left)"
              :value="step.left"
            >
              {{ step.left }} · referência inválida
            </option>
          </select></label
        >
        <label
          >Etapa direita<select v-model="step.right" required>
            <option value="">Selecione</option>
            <option v-for="s in modelValue.slice(0, i)" :key="s.id" :value="s.id">
              {{ s.id }}
            </option>
            <option
              v-if="step.right && !modelValue.slice(0, i).some((s) => s.id === step.right)"
              :value="step.right"
            >
              {{ step.right }} · referência inválida
            </option>
          </select></label
        >
        <label
          >Tipo de combinação<select v-model="step.join">
            <option value="inner">Somente correspondentes (INNER)</option>
            <option value="left">Preservar esquerda (LEFT)</option>
          </select></label
        >
        <label
          >Cardinalidade<select v-model="step.cardinality">
            <option value="one_to_one">1:1</option>
            <option value="many_to_one">N:1</option>
            <option value="one_to_many">1:N</option>
          </select></label
        >
        <div v-for="(pair, k) in step.keys" :key="k">
          <label
            >Chave esquerda {{ k + 1
            }}<select v-model="pair.left" required>
              <option value="">Selecione</option>
              <option
                v-for="c in [
                  ...new Set([
                    ...stepColumns(modelValue.slice(0, i), step.left),
                    ...(pair.left ? [pair.left] : []),
                  ]),
                ]"
                :key="c"
                :value="c"
              >
                {{ c }}
              </option>
            </select></label
          >
          <label
            >Chave direita {{ k + 1
            }}<select v-model="pair.right" required>
              <option value="">Selecione</option>
              <option
                v-for="c in [
                  ...new Set([
                    ...stepColumns(modelValue.slice(0, i), step.right),
                    ...(pair.right ? [pair.right] : []),
                  ]),
                ]"
                :key="c"
                :value="c"
              >
                {{ c }}
              </option>
            </select></label
          >
          <button type="button" @click="step.keys.splice(k, 1)">Remover par {{ k + 1 }}</button>
        </div>
        <button
          type="button"
          :disabled="step.keys.length >= 16"
          @click="step.keys.push({ left: '', right: '' })"
        >
          Adicionar par de chaves
        </button>
        <div v-for="(column, k) in step.columns" :key="k">
          <label
            >Lado do campo {{ k + 1
            }}<select v-model="column.side">
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select></label
          >
          <label
            >Campo retornado {{ k + 1
            }}<select v-model="column.column" required>
              <option value="">Selecione</option>
              <option
                v-for="c in [
                  ...new Set([
                    ...stepColumns(
                      modelValue.slice(0, i),
                      column.side === 'left' ? step.left : step.right,
                    ),
                    ...(column.column ? [column.column] : []),
                  ]),
                ]"
                :key="c"
                :value="c"
              >
                {{ c }}
              </option>
            </select></label
          >
          <label
            >Nome de saída {{ k + 1 }}<input v-model="column.as" required pattern="[a-z][a-z0-9_]*"
          /></label>
          <button type="button" @click="step.columns.splice(k, 1)">
            Remover campo {{ k + 1 }}
          </button>
        </div>
        <button
          type="button"
          :disabled="step.columns.length >= 200"
          @click="step.columns.push({ side: 'left', column: '', as: '' })"
        >
          Adicionar campo combinado
        </button>
      </template>
      <template v-else-if="step.kind === 'union'">
        <label
          >Etapas para união<select v-model="step.inputs" multiple required>
            <option v-for="s in modelValue.slice(0, i)" :key="s.id" :value="s.id">
              {{ s.id }}
            </option>
            <option
              v-for="missing in step.inputs.filter(
                (id) => !modelValue.slice(0, i).some((s) => s.id === id),
              )"
              :key="missing"
              :value="missing"
            >
              {{ missing }} · referência inválida
            </option>
          </select></label
        >
        <p>
          As entradas devem ter projeções compatíveis. A ordem selecionada faz parte do contrato.
        </p>
      </template>
      <template v-else>
        <label
          >Etapa de entrada<select v-model="step.input" required>
            <option value="">Selecione</option>
            <option v-for="s in modelValue.slice(0, i)" :key="s.id" :value="s.id">
              {{ s.id }}
            </option>
            <option
              v-if="step.input && !modelValue.slice(0, i).some((s) => s.id === step.input)"
              :value="step.input"
            >
              {{ step.input }} · referência inválida
            </option>
          </select></label
        >
        <template v-if="step.kind === 'project'">
          <div v-for="(column, k) in step.columns" :key="k">
            <label
              >Campo {{ k + 1
              }}<select v-model="column.column" required>
                <option value="">Selecione</option>
                <option
                  v-for="c in [
                    ...new Set([
                      ...stepColumns(modelValue.slice(0, i), step.input),
                      ...(column.column ? [column.column] : []),
                    ]),
                  ]"
                  :key="c"
                  :value="c"
                >
                  {{ c }}
                </option>
              </select></label
            >
            <label
              >Nome de saída {{ k + 1
              }}<input v-model="column.as" required pattern="[a-z][a-z0-9_]*"
            /></label>
            <button type="button" @click="step.columns.splice(k, 1)">
              Remover projeção {{ k + 1 }}
            </button>
          </div>
          <button
            type="button"
            :disabled="step.columns.length >= 200"
            @click="step.columns.push({ column: '', as: '' })"
          >
            Adicionar projeção
          </button>
        </template>
        <template v-if="step.kind === 'aggregate'">
          <label
            >Dimensões<select v-model="step.dimensions" multiple>
              <option
                v-for="c in [
                  ...new Set([
                    ...stepColumns(modelValue.slice(0, i), step.input),
                    ...step.dimensions,
                  ]),
                ]"
                :key="c"
                :value="c"
              >
                {{ c }}
              </option>
            </select></label
          >
          <div v-for="(measure, k) in step.measures" :key="k">
            <label
              >Função {{ k + 1
              }}<select v-model="measure.operation">
                <option value="count">Contar</option>
                <option value="sum">Somar</option>
                <option value="min">Mínimo</option>
                <option value="max">Máximo</option>
              </select></label
            >
            <label
              >Campo da medida {{ k + 1
              }}<select
                :value="measure.column ?? ''"
                :required="measure.operation !== 'count'"
                @change="measure.column = ($event.target as HTMLSelectElement).value || undefined"
              >
                <option value="">Todos (contagem)</option>
                <option
                  v-for="c in [
                    ...new Set([
                      ...stepColumns(modelValue.slice(0, i), step.input),
                      ...(measure.column ? [measure.column] : []),
                    ]),
                  ]"
                  :key="c"
                  :value="c"
                >
                  {{ c }}
                </option>
              </select></label
            >
            <label
              >Nome da medida {{ k + 1
              }}<input v-model="measure.as" required pattern="[a-z][a-z0-9_]*"
            /></label>
            <label
              >Tipo da medida {{ k + 1
              }}<select
                :value="measure.valueType ?? 'scalar'"
                @change="
                  measure.valueType = ($event.target as HTMLSelectElement).value as
                    'scalar' | 'decimal'
                "
              >
                <option value="scalar">Escalar</option>
                <option value="decimal">Decimal exato textual</option>
              </select></label
            >
            <button type="button" @click="step.measures.splice(k, 1)">
              Remover medida {{ k + 1 }}
            </button>
          </div>
          <button
            type="button"
            :disabled="step.measures.length >= 200"
            @click="step.measures.push({ operation: 'count', as: '' })"
          >
            Adicionar medida
          </button>
        </template>
        <template v-if="step.kind === 'sort'">
          <div v-for="(order, k) in step.order" :key="k">
            <label
              >Campo de ordenação {{ k + 1
              }}<select v-model="order.column" required>
                <option value="">Selecione</option>
                <option
                  v-for="c in [
                    ...new Set([
                      ...stepColumns(modelValue.slice(0, i), step.input),
                      ...(order.column ? [order.column] : []),
                    ]),
                  ]"
                  :key="c"
                  :value="c"
                >
                  {{ c }}
                </option>
              </select></label
            >
            <label
              >Direção {{ k + 1
              }}<select v-model="order.direction">
                <option value="asc">Crescente</option>
                <option value="desc">Decrescente</option>
              </select></label
            >
            <label
              >Nulos {{ k + 1
              }}<select v-model="order.nulls">
                <option value="first">No início</option>
                <option value="last">No fim</option>
              </select></label
            >
            <label
              >Tipo da ordenação {{ k + 1
              }}<select
                :value="order.valueType ?? 'scalar'"
                @change="
                  order.valueType = ($event.target as HTMLSelectElement).value as
                    'scalar' | 'decimal'
                "
              >
                <option value="scalar">Escalar</option>
                <option value="decimal">Decimal exato textual</option>
              </select></label
            >
            <button type="button" @click="step.order.splice(k, 1)">
              Remover ordenação {{ k + 1 }}
            </button>
          </div>
          <button
            type="button"
            :disabled="step.order.length >= 200"
            @click="step.order.push({ column: '', direction: 'asc', nulls: 'last' })"
          >
            Adicionar ordenação
          </button>
        </template>
      </template>
    </article>
    <label
      >Nova etapa<select v-model="kind">
        <option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option>
      </select></label
    >
    <button type="button" :disabled="modelValue.length >= 8" @click="add">
      Adicionar etapa ao cruzamento
    </button>
  </fieldset>
</template>
