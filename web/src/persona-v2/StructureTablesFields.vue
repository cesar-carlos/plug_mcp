<script setup lang="ts">
import {
  defaultStructureDialect,
  emptyStructureColumn,
  emptyStructureKey,
  emptyStructureNativeType,
  emptyStructurePhysicalName,
  emptyStructureTable,
  optionalStructureNumber,
  optionalStructureText,
  splitStructureList,
  structureDialects,
  type StructureDraft,
} from "./structure-editor";

defineProps<{ dialects: StructureDraft["dialects"] }>();
const tables = defineModel<StructureDraft["tables"]>({ required: true });

function list(event: Event): string[] {
  return splitStructureList((event.target as HTMLInputElement).value);
}
function optionalNumber(event: Event): number | undefined {
  const input = event.target as HTMLInputElement;
  return optionalStructureNumber(input.value, input.valueAsNumber);
}
</script>
<template>
  <h3>Tabelas e campos</h3>
  <details v-for="(table, ti) in tables" :key="ti" open class="relationship">
    <summary>
      {{ table.name || `Nova tabela ${ti + 1}` }} · {{ table.columns.length }} campos
    </summary>
    <label>Identificador lógico<input v-model="table.id" required /></label>
    <label>Nome da tabela<input v-model="table.name" required /></label>
    <label>Significado da tabela<textarea v-model="table.meaning" required /></label>
    <label
      >Tipo de recurso<select v-model="table.resourceType">
        <option value="table">Tabela</option>
        <option value="view">View</option>
      </select></label
    >
    <label
      >Grão: campos que identificam um registro<input
        :value="table.grain.join(', ')"
        @input="table.grain = list($event)"
    /></label>
    <h4>Nomes físicos por dialeto</h4>
    <div v-for="(physical, pi) in table.physicalNames" :key="pi" class="row">
      <label
        >Dialeto<select v-model="physical.dialect">
          <option v-for="d in structureDialects" :key="d.id" :value="d.id">{{ d.label }}</option>
        </select></label
      >
      <label>Nome qualificado<input v-model="physical.name" required /></label>
      <button type="button" class="secondary" @click="table.physicalNames.splice(pi, 1)">
        Remover nome físico
      </button>
    </div>
    <button
      type="button"
      class="secondary"
      @click="
        table.physicalNames.push(emptyStructurePhysicalName(defaultStructureDialect(dialects)))
      "
    >
      Adicionar nome físico
    </button>
    <div v-for="(column, ci) in table.columns" :key="ci" class="relationship">
      <h4>{{ column.name || `Campo ${ci + 1}` }}</h4>
      <label>Nome do campo<input v-model="column.name" required /></label>
      <label>Significado do campo<textarea v-model="column.meaning" required /></label>
      <label>Tipo lógico<input v-model="column.logicalType" required /></label>
      <label class="check"
        ><input v-model="column.nullable" type="checkbox" />Aceita valor nulo</label
      >
      <label
        >Classificação<select v-model="column.classification">
          <option value="livre">Livre</option>
          <option value="sensivel">Sensível</option>
          <option value="pessoal">Pessoal</option>
          <option value="segredo">Segredo</option>
          <option value="inferido">Ainda não revisado</option>
        </select></label
      >
      <label
        >Unidade<input
          :value="column.unit"
          @input="column.unit = optionalStructureText(($event.target as HTMLInputElement).value)"
      /></label>
      <label
        >Moeda<input
          :value="column.currency"
          @input="
            column.currency = optionalStructureText(($event.target as HTMLInputElement).value)
          "
      /></label>
      <label
        >Calendário<input
          :value="column.calendar"
          @input="
            column.calendar = optionalStructureText(($event.target as HTMLInputElement).value)
          "
      /></label>
      <div v-for="(native, ni) in column.nativeTypes" :key="ni" class="row">
        <label
          >Dialeto<select v-model="native.dialect">
            <option v-for="d in structureDialects" :key="d.id" :value="d.id">{{ d.label }}</option>
          </select></label
        >
        <label>Tipo nativo<input v-model="native.type" required /></label>
        <label
          >Precisão<input
            :value="native.precision"
            type="number"
            min="1"
            @input="native.precision = optionalNumber($event)"
        /></label>
        <label
          >Escala<input
            :value="native.scale"
            type="number"
            min="0"
            @input="native.scale = optionalNumber($event)"
        /></label>
        <label
          >Comprimento<input
            :value="native.length"
            type="number"
            min="1"
            @input="native.length = optionalNumber($event)"
        /></label>
        <button type="button" class="secondary" @click="column.nativeTypes?.splice(ni, 1)">
          Remover tipo nativo
        </button>
      </div>
      <button
        type="button"
        class="secondary"
        @click="
          (column.nativeTypes ??= []).push(
            emptyStructureNativeType(defaultStructureDialect(dialects)),
          )
        "
      >
        Adicionar tipo nativo
      </button>
      <button type="button" class="secondary" @click="table.columns.splice(ci, 1)">
        Remover campo
      </button>
    </div>
    <button type="button" class="secondary" @click="table.columns.push(emptyStructureColumn())">
      Adicionar campo
    </button>
    <h4>Chaves declaradas</h4>
    <div v-for="(key, ki) in table.keys" :key="ki" class="row">
      <label>Identificador da chave<input v-model="key.id" required /></label>
      <label
        >Tipo<select v-model="key.kind">
          <option value="primary">Primária</option>
          <option value="unique">Única</option>
        </select></label
      >
      <label
        >Campos ordenados<input :value="key.columns.join(', ')" @input="key.columns = list($event)"
      /></label>
      <label
        >Estado declarado<select v-model="key.status">
          <option value="unknown">Desconhecido</option>
          <option value="enabled">Habilitada</option>
          <option value="disabled">Desabilitada</option>
          <option value="unvalidated">Não validada</option>
        </select></label
      >
      <button type="button" class="secondary" @click="table.keys?.splice(ki, 1)">
        Remover chave
      </button>
    </div>
    <button type="button" class="secondary" @click="(table.keys ??= []).push(emptyStructureKey())">
      Adicionar chave
    </button>
    <button type="button" class="secondary" @click="tables.splice(ti, 1)">
      Remover tabela do rascunho
    </button>
  </details>
  <button type="button" @click="tables.push(emptyStructureTable())">
    Adicionar tabela ao padrão
  </button>
</template>
