<script setup lang="ts">
import StructureEditor from "./StructureEditor.vue";
import type { Content } from "./knowledge-model";
import type { PhysicalProfileOverrides } from "./physical-profile-editor";

defineProps<{
  profileId: string;
  revision: number;
  tables: Content["tables"];
  relationships: Content["relationships"];
  dirty: boolean;
  disabled: boolean;
}>();
const name = defineModel<string>("name", { required: true });
const content = defineModel<unknown>("content", { required: true });
const overrides = defineModel<PhysicalProfileOverrides>("overrides", { required: true });
const emit = defineEmits<{
  submit: [];
}>();
</script>

<template>
  <form aria-label="Editar perfil físico" @submit.prevent="emit('submit')">
    <fieldset :disabled="disabled">
      <legend>{{ profileId ? `Edição da revisão ${revision}` : "Novo rascunho físico" }}</legend>
      <label>Nome do perfil físico<input v-model="name" required maxlength="200" /></label>
      <StructureEditor v-model="content" />
      <fieldset>
        <legend>Substituições explícitas do padrão</legend>
        <p>
          Marque apenas as definições comuns que foram alteradas e revisadas. Campos comuns,
          classificação e restrições não podem ser reduzidos.
        </p>
        <label v-for="table in tables" :key="table.id" class="check"
          ><input v-model="overrides.tables" type="checkbox" :value="table.id" />Substituir
          definição de {{ table.name }}</label
        >
        <label v-for="relation in relationships" :key="relation.id" class="check"
          ><input
            v-model="overrides.relationships"
            type="checkbox"
            :value="relation.id"
          />Substituir relacionamento: {{ relation.meaning }}</label
        >
      </fieldset>
      <p v-if="dirty">Há alterações não salvas no perfil físico.</p>
      <button type="submit">Salvar perfil físico</button>
    </fieldset>
  </form>
</template>
