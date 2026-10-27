<script setup lang="ts">
import type { QueryDependency, TrainingStep } from "./federation-editor";
import OperationNameList from "./OperationNameList.vue";

const step = defineModel<Extract<TrainingStep, { kind: "local" }>>({ required: true });
const props = defineProps<{ publications: QueryDependency[] }>();

function dependency(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  const publication = props.publications.find((item) => item.id === id);
  step.value.publicationId = id;
  step.value.sourceId = publication?.sourceId ?? "";
}
</script>
<template>
  <label
    >Consulta publicada<select :value="step.publicationId" required @change="dependency">
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
  <OperationNameList v-model="step.columns" label="Colunas retornadas pela consulta (na ordem)" />
  <p>
    Declare as projeções e aliases que o SQL do caso deverá retornar. Escolher outra publicação não
    reescreve colunas ou SQL.
  </p>
</template>
