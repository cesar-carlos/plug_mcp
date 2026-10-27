<script setup lang="ts">
import { computed } from "vue";
import StructureRelationshipsFields from "./StructureRelationshipsFields.vue";
import StructureSqlLibrary from "./StructureSqlLibrary.vue";
import StructureTablesFields from "./StructureTablesFields.vue";
import {
  splitStructureRules,
  structureDialects,
  structureEditorVisibility,
  type StructureDraft,
  type StructureEditorSection,
} from "./structure-editor";
import { useStructureEditor } from "./use-structure-editor";

const props = defineProps<{
  modelValue: unknown;
  sections?: readonly StructureEditorSection[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: StructureDraft] }>();
const { content, invalid, start } = useStructureEditor(
  () => props.modelValue,
  (value) => {
    emit("update:modelValue", value);
  },
);
const shown = computed(() => structureEditorVisibility(props.sections));
</script>
<template>
  <div class="structure-editor" aria-label="Editor de estrutura">
    <p class="notice">
      Estas definições são declarações de treinamento. A conferência técnica da base e a revisão de
      negócio são etapas distintas.
    </p>
    <p v-if="invalid" role="alert">
      O conteúdo importado não corresponde ao contrato estrutural. Revise o arquivo; ele não foi
      convertido nem executado.
    </p>
    <button v-if="!content && !invalid" type="button" @click="start">
      Criar estrutura pelo formulário
    </button>
    <template v-if="content">
      <template v-if="shown.identity">
        <label>Sistema<input v-model="content.system" maxlength="200" required /></label>
        <label>Versão do padrão<input v-model="content.label" maxlength="100" required /></label>
        <fieldset>
          <legend>Dialetos declarados</legend>
          <label v-for="d in structureDialects" :key="d.id" class="check"
            ><input v-model="content.dialects" type="checkbox" :value="d.id" />{{ d.label }}</label
          >
        </fieldset>
      </template>
      <StructureTablesFields
        v-if="shown.tables"
        v-model="content.tables"
        :dialects="content.dialects"
      />
      <StructureRelationshipsFields
        v-if="shown.relationships"
        v-model="content.relationships"
        :tables="content.tables"
      />
      <template v-if="shown.library">
        <StructureSqlLibrary v-model="content.examples" :dialects="content.dialects" />
        <label
          >Regras de negócio (uma por linha)<textarea
            :value="content.rules.join('\n')"
            @input="
              content.rules = splitStructureRules(($event.target as HTMLTextAreaElement).value)
            "
          />
        </label>
        <details>
          <summary>Resumo dos relacionamentos</summary>
          <ul>
            <li v-for="r in content.relationships" :key="r.id">
              {{ content.tables.find((t) => t.id === r.from)?.name }} →
              {{ content.tables.find((t) => t.id === r.to)?.name }} · {{ r.cardinality }} ·
              {{ r.meaning }}<span v-if="r.via.length"> · via {{ r.via.join(" → ") }}</span>
            </li>
          </ul>
        </details>
      </template>
    </template>
  </div>
</template>
