<script lang="ts">
export default { name: "SkillsView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type SkillRow } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";

const { error, run } = useAction();
const skills = ref<SkillRow[]>([]);

onMounted(() => {
  void run(async (bearer) => {
    const result = await api.get<{ success: true; skills: SkillRow[] }>("/app/api/skills", bearer);
    skills.value = result.skills;
  });
});
</script>

<template>
  <Page title="Skills" :error="error">
    <div class="row" style="margin-bottom: 1rem">
      <RouterLink to="/skills/nova">Nova skill</RouterLink>
    </div>
    <div class="card">
      <table>
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
            </td>
            <td>{{ skill.slug }}</td>
            <td>{{ skill.status }}</td>
            <td>{{ skill.fluxoTreino?.proximoPasso ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Page>
</template>
