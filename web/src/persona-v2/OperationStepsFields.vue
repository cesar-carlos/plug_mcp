<script setup lang="ts">
import { bindingKey, readBinding, type OperationTraining } from "./operation-editor";
const training = defineModel<OperationTraining>({ required: true });
function move(index: number, offset: number) {
  const step = training.value.steps.splice(index, 1)[0];
  training.value.steps.splice(index + offset, 0, step);
}
</script>
<template>
  <h3>Etapas ordenadas</h3>
  <p>
    Até 32 comandos incluindo verificações auxiliares. Saídas são parâmetros tipados de etapas
    anteriores. UPDATE e DELETE exigem identidade e concorrência no filtro.
  </p>
  <fieldset v-for="(step, index) in training.steps" :key="index">
    <legend>Etapa {{ index + 1 }}</legend>
    <label
      >Identificador da etapa<input v-model="step.id" required pattern="[a-z_][a-z0-9_]*"
    /></label>
    <label
      >Comando<select v-model="step.effect">
        <option value="select">SELECT auxiliar</option>
        <option value="insert">INSERT</option>
        <option value="update">UPDATE</option>
        <option value="delete">DELETE</option>
      </select></label
    >
    <label
      >Tabela da etapa<select v-model="step.table" required>
        <option value="">Selecione</option>
        <option
          v-if="step.table && !training.tables.some((t) => t.name === step.table)"
          :value="step.table"
        >
          {{ step.table }} (fora da estrutura)
        </option>
        <option v-for="table in training.tables" :key="table.name">{{ table.name }}</option>
      </select></label
    >
    <label
      >Mínimo de linhas<input
        v-model.number="step.rows.min"
        type="number"
        min="0"
        max="100000"
        required
    /></label>
    <label
      >Máximo de linhas<input
        v-model.number="step.rows.max"
        type="number"
        min="0"
        max="100000"
        required
    /></label>
    <fieldset v-for="group in ['values', 'where'] as const" :key="group">
      <legend>{{ group === "values" ? "Valores gravados" : "Filtros obrigatórios" }}</legend>
      <div v-for="(field, i) in step[group]" :key="i" class="row">
        <label
          >Campo<select v-model="field.column" required>
            <option value="">Selecione</option>
            <option
              v-if="
                field.column &&
                !training.tables
                  .find((t) => t.name === step.table)
                  ?.columns.some((c) => c.name === field.column)
              "
              :value="field.column"
            >
              {{ field.column }} (fora da estrutura)
            </option>
            <option
              v-for="c in training.tables.find((t) => t.name === step.table)?.columns ?? []"
              :key="c.name"
              :value="c.name"
            >
              {{ c.name }}{{ group === "values" && !c.writable ? " (sem escrita)" : "" }}
            </option>
          </select></label
        >
        <label
          >Origem do valor<select
            :value="bindingKey(field.binding)"
            required
            @change="field.binding = readBinding(($event.target as HTMLSelectElement).value)"
          >
            <option :value="bindingKey(field.binding)">
              {{ bindingKey(field.binding) || "Selecione" }}
            </option>
            <option v-for="p in training.parameters" :key="p.name" :value="`input:${p.name}`">
              Parâmetro {{ p.name }} ({{ p.type }})
            </option>
            <optgroup
              v-for="previous in training.steps.slice(0, index)"
              :key="previous.id"
              :label="`Saídas de ${previous.id}`"
            >
              <option
                v-for="output in previous.outputs"
                :key="output.column"
                :value="`step:${previous.id}:${output.column}`"
              >
                {{ output.column }} ({{ output.type }})
              </option>
            </optgroup>
            <option value="operation_id">Identidade UUID da operação</option>
          </select></label
        >
        <button type="button" @click="step[group].splice(i, 1)">Remover campo</button>
      </div>
      <button
        type="button"
        :disabled="step[group].length >= 100"
        @click="step[group].push({ column: '', binding: { kind: 'input', name: '' } })"
      >
        {{ group === "values" ? "Adicionar valor gravado" : "Adicionar filtro obrigatório" }}
      </button>
    </fieldset>
    <fieldset>
      <legend>Saídas tipadas</legend>
      <div v-for="(output, i) in step.outputs" :key="i" class="row">
        <label
          >Coluna de saída<select
            :value="output.column"
            required
            @change="
              output.column = ($event.target as HTMLSelectElement).value;
              output.type = training.tables
                .find((t) => t.name === step.table)!
                .columns.find((c) => c.name === output.column)!.type;
            "
          >
            <option :value="output.column">{{ output.column || "Selecione" }}</option>
            <option
              v-for="c in training.tables.find((t) => t.name === step.table)?.columns ?? []"
              :key="c.name"
              :value="c.name"
            >
              {{ c.name }} ({{ c.type }})
            </option>
          </select></label
        ><button type="button" @click="step.outputs.splice(i, 1)">Remover saída</button>
      </div>
      <button
        type="button"
        :disabled="step.outputs.length >= 32"
        @click="step.outputs.push({ column: '', type: 'string' })"
      >
        Adicionar saída
      </button>
    </fieldset>
    <fieldset v-if="training.mode === 'sql_adaptavel' || step.adaptiveFilters?.length">
      <legend>Filtros adicionais permitidos</legend>
      <div v-for="(filter, i) in step.adaptiveFilters ?? []" :key="i" class="row">
        <label
          >Coluna adaptável<select v-model="filter.column" required>
            <option :value="filter.column">{{ filter.column || "Selecione" }}</option>
            <option
              v-for="c in training.tables.find((t) => t.name === step.table)?.columns ?? []"
              :key="c.name"
            >
              {{ c.name }}
            </option>
          </select></label
        >
        <label
          >Comparação<select v-model="filter.operator">
            <option v-for="op in ['=', '<>', '>', '>=', '<', '<=']" :key="op">{{ op }}</option>
          </select></label
        >
        <label
          >Parâmetro adaptável<select v-model="filter.parameter" required>
            <option :value="filter.parameter">{{ filter.parameter || "Selecione" }}</option>
            <option v-for="p in training.parameters" :key="p.name">{{ p.name }}</option>
          </select></label
        >
        <button type="button" @click="step.adaptiveFilters?.splice(i, 1)">
          Remover filtro adaptável
        </button>
      </div>
      <button
        type="button"
        @click="
          step.adaptiveFilters ??= [];
          step.adaptiveFilters.push({ column: '', operator: '=', parameter: '' });
        "
      >
        Adicionar filtro adaptável
      </button>
    </fieldset>
    <button type="button" :disabled="index === 0" @click="move(index, -1)">Subir etapa</button>
    <button type="button" :disabled="index === training.steps.length - 1" @click="move(index, 1)">
      Descer etapa
    </button>
    <button type="button" @click="training.steps.splice(index, 1)">Remover etapa</button>
  </fieldset>
  <button
    type="button"
    :disabled="training.steps.length >= 32"
    @click="
      training.steps.push({
        id: '',
        effect: 'update',
        table: '',
        values: [],
        where: [],
        outputs: [],
        rows: { min: 1, max: 1 },
      })
    "
  >
    Adicionar etapa SQL
  </button>
</template>
