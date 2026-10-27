<script setup lang="ts">
import { constraintLabels, type Inspection } from "./knowledge-model";
import type { Dialect } from "./model";
import {
  inspectionNullableLabel,
  inspectionPageNumber,
  inspectionResourceName,
  sourceInspectionStatusLabel,
} from "./source-inspection";

const props = defineProps<{
  result: Inspection;
  dialect: Dialect;
  disabled: boolean;
}>();
const emit = defineEmits<{
  next: [offset: number];
}>();

function inspectNextPage(): void {
  const nextOffset = props.result.evidence.metadataPage.nextOffset;
  if (nextOffset !== null) {
    emit("next", nextOffset);
  }
}
</script>

<template>
  <p role="status">
    Inspeção registrada. Leitura: {{ new Date(result.evidence.observedAt).toLocaleString() }}.
    Válida até {{ new Date(result.expiresAt).toLocaleTimeString() }}.
  </p>
  <p>Motor: {{ dialect }} · Base: {{ result.evidence.identity.database }}</p>
  <p v-if="result.evidence.composition" role="status">
    Evidência composta de {{ result.evidence.composition.pages.length }} páginas. A menor validade
    foi preservada; as leituras não representam um snapshot simultâneo.
  </p>
  <ul v-if="result.evidence.composition" aria-label="Origem das páginas">
    <li v-for="page in result.evidence.composition.pages" :key="page.id">
      Página em {{ page.offset }} · Leitura: {{ new Date(page.observedAt).toLocaleString() }}
    </li>
  </ul>
  <p v-else>
    Página {{ inspectionPageNumber(result.evidence.metadataPage.offset) }}. As páginas são
    evidências separadas.
  </p>
  <article
    v-for="item in result.evidence.resources"
    :key="`${item.resource.schema}.${item.resource.name}`"
    class="knowledge-observation"
  >
    <h4>
      {{ inspectionResourceName(item.resource) }} —
      {{ sourceInspectionStatusLabel[item.status] }}
    </h4>
    <p v-if="!item.coverage.columns" class="notice">
      Estrutura não comprovada. Confira o schema exato, o recurso e as permissões técnicas;
      metadados ausentes não provam que a tabela não existe.
    </p>
    <div
      v-if="item.columns.length"
      class="table-scroll"
      tabindex="0"
      :aria-label="`Campos de ${item.resource.name}`"
    >
      <table>
        <caption>
          Colunas observadas
        </caption>
        <thead>
          <tr>
            <th>Campo</th>
            <th>Tipo nativo</th>
            <th>Aceita nulo</th>
            <th>Tamanho/precisão</th>
            <th>Escala</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="column in item.columns" :key="column.name">
            <td>{{ column.name }}</td>
            <td>{{ column.nativeType }}</td>
            <td>{{ inspectionNullableLabel(column.nullable) }}</td>
            <td>{{ column.size ?? "Não informado" }}</td>
            <td>{{ column.scale ?? "Não informada" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul aria-label="Chaves observadas">
      <li v-for="key in item.primaryKeys" :key="`pk:${key.name}`">
        Primária {{ key.name }}: {{ key.columns.join(" → ") }} —
        {{ constraintLabels[key.status] }}
      </li>
      <li v-for="key in item.uniqueKeys ?? []" :key="`uk:${key.name}`">
        Única {{ key.name }}: {{ key.columns.join(" → ") }} — {{ constraintLabels[key.status] }}
      </li>
      <li v-for="key in item.foreignKeys" :key="`fk:${key.name}`">
        Relacionamento {{ key.name }}: {{ key.columns.join(", ") }} →
        {{ inspectionResourceName(key.target) }} ({{ key.targetColumns.join(", ") }}) —
        {{ constraintLabels[key.status] }}
      </li>
    </ul>
    <p
      v-if="!item.coverage.primaryKeys || !item.coverage.uniqueKeys || !item.coverage.foreignKeys"
      class="notice"
    >
      Cobertura de chaves incompleta: {{ !item.coverage.primaryKeys ? "primárias; " : ""
      }}{{ !item.coverage.uniqueKeys ? "unicidade; " : ""
      }}{{ !item.coverage.foreignKeys ? "relacionamentos; " : "" }}não foram integralmente
      comprovados. Lista vazia não comprova ausência.
    </p>
    <p v-if="item.limitations.includes('scoped_relationships')" class="notice">
      Relacionamentos são limitados aos recursos autorizados deste escopo. Objetos externos ao
      escopo não são expostos.
    </p>
    <p v-if="item.limitations.includes('metadata_unavailable')" class="notice">
      Há metadados indisponíveis. Revise permissões técnicas e cobertura antes de adotar esta
      estrutura.
    </p>
    <p v-if="!item.coverage.constraintStatus" class="notice">
      Constraints sem prova suficiente de enforcement. Elas não habilitam dependências executáveis.
    </p>
  </article>
  <button
    v-if="result.evidence.metadataPage.nextOffset !== null"
    type="button"
    :disabled="disabled"
    @click="inspectNextPage"
  >
    Inspecionar próxima página
  </button>
  <details>
    <summary>Identificadores da evidência</summary>
    <p>ID: {{ result.id }}</p>
    <p class="technical-value">Hash: {{ result.hash }}</p>
  </details>
</template>
