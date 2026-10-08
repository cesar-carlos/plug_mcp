<script lang="ts">
export default { name: "SkillNovaView" };
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useSkillStore } from "../stores/skills";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import SqlField from "../components/SqlField.vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import type { ParametroSkillForm } from "../stores/skills";
import Page from "../components/Page.vue";
import ParamsEditor from "../components/ParamsEditor.vue";

const router = useRouter();
const skills = useSkillStore();
const { pending, error, run, success } = useAction();
const slug = ref("");
const nome = ref("");
const descricao = ref("");
const sqlModelo = ref(skills.sqlTreinado);
skills.sqlTreinado = "";
const saved = ref(false);
const params = ref<ParametroSkillForm[]>([]);
const dirty = computed(
  () =>
    !saved.value &&
    Boolean(slug.value || nome.value || descricao.value || sqlModelo.value || params.value.length),
);
useUnsavedChanges(dirty);

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    const result = await api.post<{ success: true; skill: { id: string } }>(
      "/app/api/skills",
      {
        slug: slug.value,
        nome: nome.value,
        descricao: descricao.value,
        sqlModelo: sqlModelo.value,
        ...(params.value.length > 0 ? { params: params.value } : {}),
      },
      bearer,
    );
    saved.value = true;
    await router.push({ name: "skill", params: { id: result.skill.id } });
  });
};
</script>

<template>
  <Page
    title="Nova skill"
    lead="O SQL já precisa ter sido treinado. Tabelas fora do grafo travam a criação."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <form class="card" @submit.prevent="save">
      <div class="fields-2">
        <label>Slug <input v-model="slug" required /></label>
        <label>Nome <input v-model="nome" required /></label>
      </div>
      <label>Descrição <textarea v-model="descricao" rows="3" /></label>
      <SqlField v-model="sqlModelo" required />
      <ParamsEditor v-model="params" />
      <div class="form-actions">
        <button type="submit" :disabled="pending">Criar</button>
      </div>
    </form>
  </Page>
</template>
