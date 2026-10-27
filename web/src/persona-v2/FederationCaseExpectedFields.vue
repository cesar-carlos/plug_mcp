<script setup lang="ts">
import { computed } from "vue";
import {
  federationCaseIsNative,
  federationCaseIsSynthetic,
  type FederationEditableCase,
} from "./federation-case-editor";
import FederationRowsEditor from "./FederationRowsEditor.vue";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";
import { scalarTypes } from "./operation-editor";
import OperationNameList from "./OperationNameList.vue";

const current = defineModel<FederationEditableCase>({ required: true });
const synthetic = computed(() =>
  federationCaseIsSynthetic(current.value) ? current.value : undefined,
);
const native = computed(() => (federationCaseIsNative(current.value) ? current.value : undefined));
const nativeExpected = computed(() =>
  native.value && "rows" in native.value.expected ? native.value.expected : undefined,
);
</script>
<template>
  <template v-if="synthetic && 'rows' in synthetic.expected">
    <OperationNameList v-model="synthetic.expected.columns" label="Colunas esperadas na ordem" />
    <FederationRowsEditor
      v-model="synthetic.expected.rows"
      :columns="synthetic.expected.columns"
      label="Resultado esperado"
    />
    <label
      >Total esperado antes da paginação<input
        v-model.number="synthetic.expected.totalRows"
        type="number"
        min="0"
        required
    /></label>
  </template>
  <template v-if="nativeExpected">
    <h4>Colunas e tipos do resultado esperado</h4>
    <div v-for="(column, i) in nativeExpected.columns" :key="i">
      <label
        >Nome da coluna esperada {{ i + 1
        }}<input v-model="column.name" required pattern="[a-z_][a-z0-9_]*"
      /></label>
      <label
        >Tipo da coluna esperada {{ i + 1
        }}<select v-model="column.type">
          <option v-for="type in scalarTypes" :key="type" :value="type">{{ type }}</option>
        </select></label
      >
      <button type="button" @click="nativeExpected.columns.splice(i, 1)">
        Remover coluna esperada {{ i + 1 }}
      </button>
    </div>
    <button
      type="button"
      :disabled="nativeExpected.columns.length >= 100"
      @click="nativeExpected.columns.push({ name: '', type: 'string' })"
    >
      Adicionar coluna esperada
    </button>
    <FederationTypedRowsEditor
      v-model="nativeExpected.rows"
      :columns="nativeExpected.columns.map((c) => c.name)"
      label="Resultado tipado esperado"
    />
    <label
      ><input v-model="nativeExpected.ordered" type="checkbox" />Comparar ordem dos registros</label
    >
    <label
      >Total esperado antes da paginação<input
        v-model.number="nativeExpected.totalRows"
        type="number"
        min="0"
        max="10000"
        required
    /></label>
  </template>
</template>
