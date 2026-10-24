<script setup lang="ts">
import { computed } from "vue";
import type { DataRow, DataScalar } from "../../../src/domain/persona-v2/federation";
const props = defineProps<{
  modelValue: DataRow[];
  columns: readonly string[];
  label: string;
  single?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [DataRow[]] }>();
const fields = computed(() => [
  ...new Set([...props.columns, ...props.modelValue.flatMap((r) => Object.keys(r))]),
]);
function set(index: number, name: string, value: DataScalar) {
  emit(
    "update:modelValue",
    props.modelValue.map((r, i) => (i === index ? { ...r, [name]: value } : r)),
  );
}
function number(index: number, name: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  input.setCustomValidity(
    input.value.trim() && Number.isFinite(value)
      ? ""
      : "Informe um número finito; para decimal exato use texto.",
  );
  if (input.validationMessage === "") {
    set(index, name, value);
  }
}
</script>
<template>
  <fieldset>
    <legend>{{ label }}</legend>
    <p>
      Somente dados sintéticos. Preserve decimais exatos como texto; nulo e vazio são distintos.
    </p>
    <fieldset v-for="(row, i) in modelValue" :key="i">
      <legend>Linha {{ i + 1 }}</legend>
      <div v-for="field in fields" :key="field">
        <label
          >{{ field }} · tipo<select
            :value="
              row[field] === null ? 'null' : row[field] === undefined ? 'absent' : typeof row[field]
            "
            @change="
              set(
                i,
                field,
                (
                  { string: '', number: 0, boolean: false, null: null } as Record<
                    string,
                    DataScalar
                  >
                )[($event.target as HTMLSelectElement).value]!,
              )
            "
          >
            <option v-if="row[field] === undefined" value="absent" disabled>Ausente</option>
            <option value="string">Texto / decimal exato</option>
            <option value="number">Número aproximado</option>
            <option value="boolean">Booleano</option>
            <option value="null">Nulo</option>
          </select></label
        >
        <label v-if="typeof row[field] === 'string'"
          >{{ field }} · valor<input
            :value="row[field] as string"
            maxlength="16384"
            @input="set(i, field, ($event.target as HTMLInputElement).value)"
        /></label>
        <label v-else-if="typeof row[field] === 'number'"
          >{{ field }} · valor<input
            type="number"
            step="any"
            required
            :value="row[field]"
            @input="number(i, field, $event)"
        /></label>
        <label v-else-if="typeof row[field] === 'boolean'"
          >{{ field }} · valor<select
            :value="String(row[field])"
            @change="set(i, field, ($event.target as HTMLSelectElement).value === 'true')"
          >
            <option value="true">Verdadeiro</option>
            <option value="false">Falso</option>
          </select></label
        >
      </div>
      <button
        v-if="!single"
        type="button"
        @click="
          emit(
            'update:modelValue',
            modelValue.filter((_, index) => index !== i),
          )
        "
      >
        Remover linha {{ i + 1 }}
      </button>
    </fieldset>
    <button
      v-if="!single"
      type="button"
      :disabled="modelValue.length >= 5000 || !columns.length"
      @click="
        emit('update:modelValue', [...modelValue, Object.fromEntries(columns.map((c) => [c, '']))])
      "
    >
      Adicionar linha em {{ label }}
    </button>
  </fieldset>
</template>
