<script setup lang="ts">
import RelationshipDiagram from "./RelationshipDiagram.vue";
import {
  applyStructureRelationshipOrigin,
  emptyStructureKeyPair,
  emptyStructureRelationship,
  optionalStructureText,
  splitStructureList,
  structureTableColumns,
  type StructureDraft,
} from "./structure-editor";

defineProps<{ tables: StructureDraft["tables"] }>();
const relationships = defineModel<StructureDraft["relationships"]>({ required: true });

function list(event: Event): string[] {
  return splitStructureList((event.target as HTMLInputElement).value);
}
function changeOrigin(relation: StructureDraft["relationships"][number], event: Event): void {
  applyStructureRelationshipOrigin(relation, (event.target as HTMLSelectElement).value);
}
</script>
<template>
  <h3>Relacionamentos</h3>
  <div v-for="(r, ri) in relationships" :key="ri" class="relationship">
    <label>Identificador do relacionamento<input v-model="r.id" required /></label>
    <label
      >Origem<select v-model="r.from">
        <option value="">Selecione</option>
        <option v-for="t in tables" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select></label
    >
    <label
      >Destino<select v-model="r.to">
        <option value="">Selecione</option>
        <option v-for="t in tables" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select></label
    >
    <label
      >Cardinalidade<select v-model="r.cardinality">
        <option>1:1</option>
        <option>1:N</option>
        <option>N:1</option>
        <option>N:N</option>
      </select></label
    >
    <label
      >Combinação<select v-model="r.join">
        <option value="inner">Somente correspondências</option>
        <option value="left">Preservar origem sem correspondência</option>
      </select></label
    >
    <label class="check"
      ><input v-model="r.optional" type="checkbox" />Relacionamento opcional</label
    >
    <label>Significado do relacionamento<textarea v-model="r.meaning" required /></label>
    <label
      >Origem da declaração<select
        :value="r.origin ?? 'business'"
        @change="changeOrigin(r, $event)"
      >
        <option value="business">Negócio, exige revisão</option>
        <option value="database">Restrição declarada no banco, exige conferência</option>
      </select></label
    >
    <template v-if="r.origin === 'database'">
      <label
        >Nome declarado da constraint<input
          :value="r.constraintName"
          @input="
            r.constraintName = optionalStructureText(($event.target as HTMLInputElement).value)
          "
      /></label>
      <label
        >Estado declarado da constraint<select v-model="r.constraintStatus">
          <option value="unknown">Desconhecido</option>
          <option value="enabled">Habilitada</option>
          <option value="disabled">Desabilitada</option>
          <option value="unvalidated">Não validada</option>
        </select></label
      >
      <p>Declaração de treinamento. Somente inspeção autorizada pode comprovar o estado físico.</p>
    </template>
    <div v-for="(pair, pi) in r.keys" :key="pi" class="row">
      <label
        >Campo de origem<select v-model="pair.from">
          <option value="">Selecione</option>
          <option v-for="c in structureTableColumns(tables, r.from)" :key="c.name">
            {{ c.name }}
          </option>
        </select></label
      >
      <label
        >Campo de destino<select v-model="pair.to">
          <option value="">Selecione</option>
          <option v-for="c in structureTableColumns(tables, r.to)" :key="c.name">
            {{ c.name }}
          </option>
        </select></label
      >
      <button type="button" class="secondary" @click="r.keys.splice(pi, 1)">Remover par</button>
    </div>
    <button type="button" class="secondary" @click="r.keys.push(emptyStructureKeyPair())">
      Adicionar par de chave
    </button>
    <label
      >Tabelas intermediárias (IDs na ordem)<input
        :value="r.via.join(', ')"
        @input="r.via = list($event)"
    /></label>
    <label
      >Caminho N:N (IDs das relações diretas na ordem)<input
        :value="r.path?.join(', ')"
        @input="r.path = list($event)"
    /></label>
    <button type="button" class="secondary" @click="relationships.splice(ri, 1)">
      Remover relacionamento
    </button>
  </div>
  <button type="button" @click="relationships.push(emptyStructureRelationship())">
    Adicionar relacionamento ao padrão
  </button>
  <RelationshipDiagram :tables="tables" :relationships="relationships" />
</template>
