<script setup lang="ts">
import type { Training } from "./model";
import { queryColumnsForTable, queryDiagramNodes, queryHasPendingName } from "./query-training";
import RelationshipDiagram from "./RelationshipDiagram.vue";
import RelationshipPathFields from "./RelationshipPathFields.vue";
import { addTrainingRelationship } from "./training-draft";

const training = defineModel<Training>({ required: true });
</script>
<template>
  <h3>Relacionamentos</h3>
  <div v-for="(relation, i) in training.relationships" :key="i" class="relationship">
    <label
      >Identificador do relacionamento<input
        v-model="relation.id"
        pattern="[a-z][a-z0-9_-]*"
        maxlength="100"
    /></label>
    <div class="row">
      <label
        >Tabela de origem<select v-model="relation.from" required>
          <option value="">Selecione</option>
          <option
            v-if="
              queryHasPendingName(
                training.tables.map((item) => item.name),
                relation.from,
              )
            "
            :value="relation.from"
          >
            {{ relation.from }} (referência pendente)
          </option>
          <option v-for="item in training.tables" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select></label
      ><label
        >Tabela de destino<select v-model="relation.to" required>
          <option value="">Selecione</option>
          <option
            v-if="
              queryHasPendingName(
                training.tables.map((item) => item.name),
                relation.to,
              )
            "
            :value="relation.to"
          >
            {{ relation.to }} (referência pendente)
          </option>
          <option v-for="item in training.tables" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select></label
      ><label
        >Tipo<select v-model="relation.join">
          <option value="inner">INNER JOIN</option>
          <option value="left">LEFT JOIN</option>
        </select></label
      ><label
        >Cardinalidade<select v-model="relation.cardinality">
          <option>1:1</option>
          <option>N:1</option>
          <option>1:N</option>
          <option>N:N</option>
        </select></label
      >
    </div>
    <div v-for="(pair, j) in relation.keys" :key="j" class="row">
      <label
        >Coluna de origem<select v-model="pair.from" required>
          <option value="">Selecione</option>
          <option
            v-if="
              queryHasPendingName(
                queryColumnsForTable(training.columns, relation.from).map((item) => item.name),
                pair.from,
              )
            "
            :value="pair.from"
          >
            {{ pair.from }} (referência pendente)
          </option>
          <option
            v-for="item in queryColumnsForTable(training.columns, relation.from)"
            :key="item.name"
          >
            {{ item.name }}
          </option>
        </select></label
      ><label
        >Coluna de destino<select v-model="pair.to" required>
          <option value="">Selecione</option>
          <option
            v-if="
              queryHasPendingName(
                queryColumnsForTable(training.columns, relation.to).map((item) => item.name),
                pair.to,
              )
            "
            :value="pair.to"
          >
            {{ pair.to }} (referência pendente)
          </option>
          <option
            v-for="item in queryColumnsForTable(training.columns, relation.to)"
            :key="item.name"
          >
            {{ item.name }}
          </option>
        </select></label
      ><button type="button" @click="relation.keys.splice(j, 1)">Remover par</button>
    </div>
    <button type="button" @click="relation.keys.push({ from: '', to: '' })">
      Adicionar par de colunas</button
    ><label>O que esse relacionamento significa?<input v-model="relation.meaning" required /></label
    ><button type="button" @click="training.relationships.splice(i, 1)">
      Remover relacionamento
    </button>
    <RelationshipPathFields
      v-model="training.relationships[i]"
      :relations="training.relationships"
      :tables="training.tables"
    />
  </div>
  <button type="button" @click="addTrainingRelationship(training)">Adicionar relacionamento</button>
  <RelationshipDiagram
    :tables="queryDiagramNodes(training.tables)"
    :relationships="training.relationships"
  />
</template>
