<script lang="ts">
export default { name: "SkillsView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type SkillRow } from "../api";
import { useAction } from "../composables/useAction";
import { passoLabel, statusLabel, toneForStatus } from "../presentation";
import Page from "../components/Page.vue";
import StatusPill from "../components/StatusPill.vue";

const { error, run } = useAction();
const skills = ref<SkillRow[]>([]);
const pronto = ref(false);

const faltaSql = (skill: SkillRow): string =>
  skill.faltas?.find((falta) => falta.kind === "sql")?.message ?? "";

onMounted(() => {
  void run(async (bearer) => {
    const result = await api.get<{ success: true; skills: SkillRow[] }>("/app/api/skills", bearer);
    skills.value = result.skills;
  }).then(() => {
    pronto.value = true;
  });
});
</script>

<template>
  <Page
    title="Skills"
    lead="Cada linha é o pacote deste acesso. O SQL fica na skill, não nesta lista."
    :error="error"
  >
    <template #actions>
      <RouterLink class="btn" to="/skills/nova">Nova skill</RouterLink>
    </template>
    <p v-if="pronto && !error && skills.length === 0" class="empty">Nenhuma skill neste acesso.</p>
    <div v-else-if="skills.length > 0" class="card">
      <table class="data">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Próximo passo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="skill in skills" :key="skill.id">
            <td>
              <RouterLink :to="`/skills/${skill.id}`">{{ skill.nome }}</RouterLink>
              <p v-if="faltaSql(skill)" class="row-note">{{ faltaSql(skill) }}</p>
            </td>
            <td class="mono">{{ skill.slug }}</td>
            <td>
              <StatusPill :label="statusLabel(skill.status)" :tone="toneForStatus(skill.status)" />
            </td>
            <td>{{ passoLabel(skill.fluxoTreino?.proximoPasso) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Page>
</template>
