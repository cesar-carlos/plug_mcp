<script lang="ts">
export default { name: "BinaryAttachmentEditor" };
</script>

<script setup lang="ts">
import type { Training } from "./model";
const model = defineModel<Training["binaryAttachments"]>();
const props = defineProps<{ columns: Training["columns"] }>();
const mimeTypes = [
  "application/octet-stream",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
function toggle(event: Event) {
  model.value = (event.target as HTMLInputElement).checked
    ? {
        table: "",
        column: "",
        mimeTypes: [],
        maxBytes: 1048576,
        ttlMs: 300000,
      }
    : undefined;
}
function select(event: Event) {
  const column = props.columns[Number((event.target as HTMLSelectElement).value)];
  if (model.value && column)
    model.value = { ...model.value, table: column.table, column: column.name };
}
function mime(mimeType: (typeof mimeTypes)[number], event: Event) {
  if (!model.value) return;
  model.value = {
    ...model.value,
    mimeTypes: (event.target as HTMLInputElement).checked
      ? [...model.value.mimeTypes, mimeType]
      : model.value.mimeTypes.filter((m) => m !== mimeType),
  };
}
</script>
<template>
  <fieldset>
    <legend>Anexo binário desta consulta</legend>
    <label class="check"
      ><input type="checkbox" :checked="!!model" @change="toggle" />Permitir arquivo binário após
      publicação e concessão explícitas</label
    >
    <template v-if="model">
      <label
        >Coluna física do arquivo<select
          :value="columns.findIndex((c) => c.table === model?.table && c.name === model?.column)"
          required
          @change="select"
        >
          <option value="-1" disabled>Selecione uma coluna cadastrada</option>
          <option v-for="(c, index) in columns" :key="`${c.table}.${c.name}`" :value="index">
            {{ c.table }}.{{ c.name }}
          </option>
        </select></label
      >
      <fieldset>
        <legend>Tipos de download permitidos</legend>
        <label v-for="type in mimeTypes" :key="type" class="check"
          ><input
            type="checkbox"
            :checked="model.mimeTypes.includes(type)"
            @change="mime(type, $event)"
          />{{ type }}</label
        >
      </fieldset>
      <label
        >Limite do binário (MiB)<input
          type="number"
          min="0.25"
          max="8"
          step="0.25"
          :value="model.maxBytes / 1048576"
          required
          @input="model.maxBytes = Number(($event.target as HTMLInputElement).value) * 1048576"
      /></label>
      <label
        >Validade do binário (minutos)<input
          type="number"
          min="1"
          max="15"
          step="1"
          :value="model.ttlMs / 60000"
          required
          @input="model.ttlMs = Number(($event.target as HTMLInputElement).value) * 60000"
      /></label>
      <p>
        O SQL deve retornar somente essa coluna, de um registro completo, com ORDER BY. Marque
        projeção e exportação na coluna. O tipo binário será comprovado pelo agente; o arquivo não
        será convertido ou executado. Tokens existentes exigem nova concessão.
      </p>
    </template>
  </fieldset>
</template>
