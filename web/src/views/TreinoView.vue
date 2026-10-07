<script lang="ts">
export default { name: "TreinoView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import JsonBlock from "../components/JsonBlock.vue";

const { error, run } = useAction();
const sql = ref("");
const skillId = ref("");
const tabela = ref("");
const finalidade = ref("amostra_estrutura");
const result = ref<unknown>(null);

const treinar = async (): Promise<void> => {
  await run(async (bearer) => {
    result.value = await api.post("/app/api/treino/sql", { sql: sql.value }, bearer);
  });
};

const validar = async (): Promise<void> => {
  await run(async (bearer) => {
    result.value = await api.post(
      "/app/api/treino/validar",
      { sql: sql.value, skillId: skillId.value || undefined },
      bearer,
    );
  });
};

const inspecionar = async (): Promise<void> => {
  await run(async (bearer) => {
    result.value = await api.post(
      "/app/api/treino/inspecionar",
      {
        sql: sql.value || undefined,
        skillId: skillId.value || undefined,
        tabela: tabela.value || undefined,
        finalidade: finalidade.value,
      },
      bearer,
    );
  });
};
</script>

<template>
  <Page
    title="Treino e validação"
    lead="SQL livre passa pelo validador fail-closed. Inspeção pede finalidade e não emite handle de anexo."
    :error="error"
  >
    <form class="card" @submit.prevent="treinar">
      <label>SQL <textarea v-model="sql" rows="10" /></label>
      <label>skillId (opcional) <input v-model="skillId" /></label>
      <label>Tabela para inspeção <input v-model="tabela" /></label>
      <label>
        Finalidade
        <select v-model="finalidade">
          <option value="amostra_estrutura">amostra_estrutura</option>
          <option value="validar_tipo">validar_tipo</option>
          <option value="avaliar_nulos">avaliar_nulos</option>
          <option value="verificar_join">verificar_join</option>
        </select>
      </label>
      <div class="row">
        <button type="submit">Treinar com SQL</button>
        <button class="secondary" type="button" @click="validar">Validar consulta</button>
        <button class="secondary" type="button" @click="inspecionar">Inspecionar</button>
      </div>
    </form>
    <JsonBlock v-if="result" :value="result" />
  </Page>
</template>
