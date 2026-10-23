<script setup lang="ts">
import type { OperationTraining } from "./operation-editor";
import RelationshipDiagram from "./RelationshipDiagram.vue";
import RelationshipPathFields from "./RelationshipPathFields.vue";
const props = defineProps<{ tables: OperationTraining["tables"] }>();
const relations = defineModel<NonNullable<OperationTraining["relationships"]>>({ required: true });
function add() {
  let n = 1;
  while (relations.value.some((r) => r.id === `relacao_${n}`)) {
    n++;
  }
  relations.value = [
    ...relations.value,
    {
      id: `relacao_${n}`,
      from: "",
      to: "",
      cardinality: "N:1",
      join: "inner",
      meaning: "",
      keys: [{ from: "", to: "" }],
    },
  ];
}
function move<T>(items: T[], index: number, offset: number) {
  const item = items.splice(index, 1)[0];
  items.splice(index + offset, 0, item);
}
const columns = (table: string) => props.tables.find((t) => t.name === table)?.columns ?? [];
</script>
<template>
  <section aria-label="Relacionamentos da operação SQL">
    <h3>Relacionamentos da operação</h3>
    <p>
      Declare significado, cardinalidade e pares ordenados. N:N exige intermediárias e elos diretos
      explícitos. A declaração não comprova uma FK nem concede escrita ou JOIN no lançamento.
    </p>
    <fieldset v-for="(r, index) in relations" :key="index">
      <legend>Relacionamento {{ index + 1 }}</legend>
      <label
        >Identificador do relacionamento<input
          v-model="r.id"
          pattern="[a-z][a-z0-9_-]*"
          maxlength="100"
          required
      /></label>
      <label
        >Origem do relacionamento<select v-model="r.from" required>
          <option :value="r.from">{{ r.from || "Selecione" }}</option>
          <option v-for="t in tables" :key="t.name">{{ t.name }}</option>
        </select></label
      >
      <label
        >Destino do relacionamento<select v-model="r.to" required>
          <option :value="r.to">{{ r.to || "Selecione" }}</option>
          <option v-for="t in tables" :key="t.name">{{ t.name }}</option>
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
        >Associação treinada<select v-model="r.join">
          <option value="inner">Correspondência obrigatória (inner)</option>
          <option value="left">Correspondência opcional à direita (left)</option>
        </select></label
      >
      <label
        >Significado do relacionamento<textarea v-model="r.meaning" required maxlength="5000" />
      </label>
      <fieldset v-for="(pair, i) in r.keys" :key="i">
        <legend>Par de chaves {{ i + 1 }}</legend>
        <label
          >Campo de origem<select v-model="pair.from" required>
            <option :value="pair.from">{{ pair.from || "Selecione" }}</option>
            <option v-for="c in columns(r.from)" :key="c.name">{{ c.name }}</option>
          </select></label
        >
        <label
          >Campo de destino<select v-model="pair.to" required>
            <option :value="pair.to">{{ pair.to || "Selecione" }}</option>
            <option v-for="c in columns(r.to)" :key="c.name">{{ c.name }}</option>
          </select></label
        >
        <button type="button" :disabled="i === 0" @click="move(r.keys, i, -1)">Subir par</button
        ><button type="button" :disabled="i === r.keys.length - 1" @click="move(r.keys, i, 1)">
          Descer par
        </button>
        <button type="button" :disabled="r.keys.length === 1" @click="r.keys.splice(i, 1)">
          Remover par
        </button>
      </fieldset>
      <button
        type="button"
        :disabled="r.keys.length >= 16"
        @click="r.keys.push({ from: '', to: '' })"
      >
        Adicionar par de chaves
      </button>
      <RelationshipPathFields v-model="relations[index]" :relations="relations" :tables="tables" />
      <button type="button" @click="relations.splice(index, 1)">
        Remover relacionamento da operação
      </button>
    </fieldset>
    <button type="button" :disabled="relations.length >= 128" @click="add">
      Adicionar relacionamento da operação
    </button>
    <RelationshipDiagram
      :tables="tables.map((t) => ({ id: t.name, name: t.name }))"
      :relationships="relations"
    />
  </section>
</template>
