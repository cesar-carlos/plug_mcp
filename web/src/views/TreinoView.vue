<script lang="ts">
export default { name: "TreinoView" };
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSkillStore } from "../stores/skills";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import SkillSelect from "../components/SkillSelect.vue";
import SqlField from "../components/SqlField.vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";

const { error, pending, success, run } = useAction();
const route = useRoute();
const router = useRouter();
const skills = useSkillStore();
const sql = ref("");
const skillId = ref(typeof route.query.skillId === "string" ? route.query.skillId : "");
const treinado = ref("");
const dirty = computed(() => Boolean(sql.value) && sql.value !== treinado.value);
useUnsavedChanges(dirty);
const criar = async (): Promise<void> => {
  skills.sqlTreinado = sql.value;
  await router.push({ name: "skill-nova" });
};
const tabela = ref("");
const finalidade = ref("amostra_estrutura");
const result = ref<unknown>(null);

const treinar = async (): Promise<void> => {
  await run(async (bearer) => {
    result.value = await api.post("/app/api/treino/sql", { sql: sql.value }, bearer);
    treinado.value = sql.value;
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
    :pending="pending"
    :success="success"
  >
    <div v-if="skillId" class="context-banner">
      <span>Treinamento da skill selecionada</span
      ><RouterLink :to="`/skills/${skillId}`">Voltar à skill</RouterLink>
    </div>
    <form class="card" @submit.prevent="treinar">
      <fieldset class="section">
        <legend>SQL</legend>
        <SqlField v-model="sql" label="SQL de treinamento" />
        <SkillSelect
          :model-value="skillId"
          @update:model-value="skillId = typeof $event === 'string' ? $event : ''"
        />
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
        <button v-if="treinado && sql === treinado" class="secondary" type="button" @click="criar">
          Criar skill com este SQL
        </button>
      </div>
    </form>
    <div v-if="result" class="card">
      <h2>Resultado</h2>
      <DataView :value="result" />
    </div>
  </Page>
</template>
