<script setup lang="ts">
import type { Training } from "./model";
const props = defineProps<{ field: Training["columns"][number] }>();
const emit = defineEmits<{ change: [field: Training["columns"][number]] }>();
const labels = {
  projecao: "Exibir no resultado",
  filtro: "Filtrar registros",
  join: "Relacionar registros (JOIN)",
  agrupamento: "Agrupar e agregar",
  ordenacao: "Ordenar",
  exportacao: "Exportar em anexo (JSON ou binário)",
} as const;
function explicit(event: Event) {
  const field = { ...props.field };
  if ((event.target as HTMLInputElement).checked) field.uses = [];
  else {
    delete field.uses;
    delete field.usePurpose;
  }
  emit("change", field);
}
function toggle(use: keyof typeof labels, event: Event) {
  const uses = (props.field.uses ?? []).filter((value) => value !== use);
  if ((event.target as HTMLInputElement).checked) uses.push(use);
  emit("change", { ...props.field, uses });
}
</script>
<template>
  <fieldset v-if="!['segredo', 'inferido'].includes(field.classification)">
    <legend>Finalidades de {{ field.table }}.{{ field.name }}</legend>
    <label v-if="field.classification === 'livre'" class="check">
      <input type="checkbox" :checked="field.uses !== undefined" @change="explicit" />
      Restringir as finalidades deste campo livre
    </label>
    <template v-if="field.uses !== undefined || field.classification !== 'livre'">
      <label v-for="(label, use) in labels" :key="use" class="check">
        <input
          type="checkbox"
          :checked="field.uses?.includes(use)"
          @change="toggle(use, $event)"
        />{{ label }}
      </label>
      <label
        >Justificativa de uso
        <textarea
          :value="field.usePurpose"
          :required="field.classification !== 'livre'"
          @input="
            emit('change', { ...field, usePurpose: ($event.target as HTMLTextAreaElement).value })
          "
        />
      </label>
      <p>
        Os usos publicados também exigem concessão explícita no token. Filtrar não permite exibir.
      </p>
    </template>
    <p v-else>
      Campo livre: usos de consulta existentes. Exportação exige seleção explícita e contrato de
      anexos publicado.
    </p>
  </fieldset>
  <p v-else>Segredos e campos não confirmados não podem ser usados em consultas.</p>
</template>
