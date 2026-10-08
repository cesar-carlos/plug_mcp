<script lang="ts">
export default { name: "ParamsEditor" };
</script>

<script setup lang="ts">
import type { ParametroSkillForm, TipoParametro } from "../stores/skills";

const props = defineProps<{ modelValue: ParametroSkillForm[] }>();
const emit = defineEmits<{ "update:modelValue": [value: ParametroSkillForm[]] }>();

const tipos: TipoParametro[] = [
  "string",
  "number",
  "integer",
  "decimal",
  "date",
  "datetime",
  "boolean",
];

const update = (index: number, patch: Partial<ParametroSkillForm>): void => {
  emit(
    "update:modelValue",
    props.modelValue.map((item, current) => (current === index ? { ...item, ...patch } : item)),
  );
};

const add = (): void => {
  emit("update:modelValue", [
    ...props.modelValue,
    { nome: "", descricao: "", obrigatorio: true, tipo: "string" },
  ]);
};

const remove = (index: number): void => {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, current) => current !== index),
  );
};

const fieldValue = (target: unknown, key: "value" | "checked"): unknown => {
  if (typeof target !== "object" || target === null || !(key in target)) {
    return undefined;
  }
  return (target as { value?: unknown; checked?: unknown })[key];
};

const inputValue = (event: { target: unknown }): string => {
  const value = fieldValue(event.target, "value");
  return typeof value === "string" ? value : "";
};

const checkedValue = (event: { target: unknown }): boolean =>
  fieldValue(event.target, "checked") === true;

const tipoValue = (event: { target: unknown }): TipoParametro => {
  const value = inputValue(event);
  return (tipos as readonly string[]).includes(value) ? (value as TipoParametro) : "string";
};
</script>

<template>
  <div>
    <p class="hint">
      Cada parâmetro do SQL precisa de descrição. O tipo padrão string gera falta, sem bloquear a
      publicação.
    </p>
    <div v-for="(param, index) in modelValue" :key="index" class="card">
      <label
        >Nome
        <input :value="param.nome" required @input="update(index, { nome: inputValue($event) })"
      /></label>
      <label
        >Descrição
        <input
          :value="param.descricao"
          required
          @input="update(index, { descricao: inputValue($event) })"
      /></label>
      <label>
        Tipo
        <select :value="param.tipo" @change="update(index, { tipo: tipoValue($event) })">
          <option v-for="tipo in tipos" :key="tipo" :value="tipo">{{ tipo }}</option>
        </select>
      </label>
      <label class="choice">
        <input
          type="checkbox"
          :checked="param.obrigatorio"
          @change="update(index, { obrigatorio: checkedValue($event) })"
        />
        <span>Obrigatório</span>
      </label>
      <button class="secondary" type="button" @click="remove(index)">Remover parâmetro</button>
    </div>
    <button class="secondary" type="button" @click="add">Adicionar parâmetro</button>
  </div>
</template>
