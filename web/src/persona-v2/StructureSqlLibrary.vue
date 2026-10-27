<script setup lang="ts">
import { computed } from "vue";
import { duplicateSqlExamples } from "./training-visual";
import {
  defaultStructureDialect,
  emptyStructureExample,
  emptyStructureExampleParameter,
  emptyStructureExampleVariant,
  structureDialects,
  structureExampleParameterTypes,
  structureExampleSqls,
  type StructureDraft,
} from "./structure-editor";

defineProps<{ dialects: StructureDraft["dialects"] }>();
const examples = defineModel<StructureDraft["examples"]>({ required: true });
const duplicates = computed(() => duplicateSqlExamples(structureExampleSqls(examples.value)));
</script>
<template>
  <h3>Biblioteca SQL</h3>
  <p v-for="pair in duplicates" :key="pair.join(':')" class="notice">
    Possível duplicação entre {{ pair[0] }} e {{ pair[1] }} no mesmo dialeto. Revise antes de
    consolidar.
  </p>
  <div v-for="(example, ei) in examples" :key="ei" class="relationship">
    <label>Identificador do exemplo<input v-model="example.id" required /></label>
    <label>Finalidade do exemplo<textarea v-model="example.purpose" required /></label>
    <label>Explicação<textarea v-model="example.explanation" required /></label>
    <label
      >Estado editorial<select v-model="example.state">
        <option value="candidate">Candidato — exige revisão</option>
        <option value="inactive">Inativo</option>
        <option value="approved">Revisado para publicação</option>
        <option value="replaced">Substituído</option>
      </select></label
    >
    <div v-for="(variant, vi) in example.variants" :key="vi" class="relationship">
      <label
        >Dialeto<select v-model="variant.dialect">
          <option v-for="d in structureDialects" :key="d.id" :value="d.id">{{ d.label }}</option>
        </select></label
      >
      <label
        >SQL do exemplo<textarea v-model="variant.sql" class="sql" required spellcheck="false" />
      </label>
      <div v-for="(parameter, pi) in variant.parameters" :key="pi" class="row">
        <label>Parâmetro<input v-model="parameter.name" required /></label>
        <label>Significado<input v-model="parameter.meaning" required /></label>
        <label
          >Tipo<select v-model="parameter.type">
            <option v-for="type in structureExampleParameterTypes" :key="type">
              {{ type }}
            </option>
          </select></label
        >
        <label class="check"
          ><input v-model="parameter.required" type="checkbox" />Obrigatório</label
        >
        <button type="button" class="secondary" @click="variant.parameters.splice(pi, 1)">
          Remover parâmetro
        </button>
      </div>
      <button
        type="button"
        class="secondary"
        @click="variant.parameters.push(emptyStructureExampleParameter())"
      >
        Adicionar parâmetro ao exemplo
      </button>
      <button type="button" class="secondary" @click="example.variants.splice(vi, 1)">
        Remover variante
      </button>
    </div>
    <button
      type="button"
      class="secondary"
      @click="
        example.variants.push(emptyStructureExampleVariant(defaultStructureDialect(dialects)))
      "
    >
      Adicionar variante SQL
    </button>
    <button type="button" class="secondary" @click="examples.splice(ei, 1)">Remover exemplo</button>
  </div>
  <button type="button" @click="examples.push(emptyStructureExample())">
    Adicionar exemplo ao padrão
  </button>
</template>
