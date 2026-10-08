<script lang="ts">
export default { name: "TreinoView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";

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
      <fieldset class="section">
        <legend>SQL</legend>
        <label>
          Comando
          <textarea v-model="sql" rows="10" placeholder="SELECT com colunas nomeadas" />
        </label>
        <label>
          skillId
          <input v-model="skillId" placeholder="Opcional" />
        </label>
      </fieldset>
      <fieldset class="section">
        <legend>Inspeção</legend>
        <div class="fields-2">
          <label>Tabela <input v-model="tabela" /></label>
          <label>
            Finalidade
            <select v-model="finalidade">
              <option value="amostra_estrutura">Amostra de estrutura</option>
              <option value="validar_tipo">Validar tipo</option>
              <option value="avaliar_nulos">Avaliar nulos</option>
              <option value="verificar_join">Verificar JOIN</option>
            </select>
          </label>
        </div>
        <p class="hint">A inspeção não emite handle de anexo.</p>
      </fieldset>
      <div class="form-actions">
        <button type="submit">Treinar com SQL</button>
        <button class="secondary" type="button" @click="validar">Validar consulta</button>
        <button class="secondary" type="button" @click="inspecionar">Inspecionar</button>
      </div>
    </form>
    <div v-if="result" class="card">
      <h2>Resultado</h2>
      <DataView :value="result" />
    </div>
  </Page>
</template>
