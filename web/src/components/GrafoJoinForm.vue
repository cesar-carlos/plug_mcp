<script lang="ts">
export default { name: "GrafoJoinForm" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import type { GrafoJoinBody } from "../form-payloads";
import ConfirmField from "./ConfirmField.vue";

const origem = ref("");
const destino = ref("");
const colunaOrigem = ref("");
const colunaDestino = ref("");
const cardinalidade = ref("1:N");
const tipoJoin = ref("");
const confirmado = ref(false);

const emit = defineEmits<{
  confirmar: [body: GrafoJoinBody];
  remover: [body: GrafoJoinBody];
}>();

const body = (withConfirm: boolean): GrafoJoinBody => ({
  tabelaOrigem: origem.value,
  tabelaDestino: destino.value,
  colunaOrigem: colunaOrigem.value,
  colunaDestino: colunaDestino.value,
  cardinalidade: cardinalidade.value,
  ...(tipoJoin.value ? { tipoJoin: tipoJoin.value } : {}),
  ...(withConfirm ? { confirmadoPeloUsuario: confirmado.value } : {}),
});
</script>

<template>
  <div class="card">
    <h2>Relacionamento</h2>
    <div class="fields-2">
      <label>Tabela origem <input v-model="origem" /></label>
      <label>Coluna origem <input v-model="colunaOrigem" /></label>
      <label>Tabela destino <input v-model="destino" /></label>
      <label>Coluna destino <input v-model="colunaDestino" /></label>
    </div>
    <label>
      Cardinalidade
      <select v-model="cardinalidade">
        <option>1:1</option>
        <option>1:N</option>
        <option>N:1</option>
        <option>N:N</option>
      </select>
    </label>
    <label>
      tipoJoin (vazio preserva o tipo do SQL)
      <select v-model="tipoJoin">
        <option value="">preservar</option>
        <option value="inner">inner</option>
        <option value="left">left</option>
      </select>
    </label>
    <ConfirmField v-model="confirmado" />
    <div class="form-actions">
      <button type="button" @click="emit('confirmar', body(false))">Confirmar JOIN</button>
      <button class="danger" type="button" @click="emit('remover', body(true))">
        Remover JOIN
      </button>
    </div>
  </div>
</template>
