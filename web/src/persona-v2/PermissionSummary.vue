<script setup lang="ts">
import type { GrantPublication, Source } from "./model";
import { administrativeOptions } from "./administrative-options";
defineProps<{
  permissions: {
    sourceIds: string[];
    skills: { skillId: string; effects: string[]; requireHumanApproval: boolean }[];
    externalOperationIds: string[];
    administrative: string[];
    managedIntegrationIds?: string[];
  };
  publications: Record<string, GrantPublication>;
  sources: Source[];
}>();
const effects: Record<string, string> = {
  select: "Consultar",
  insert: "Inserir",
  update: "Atualizar",
  delete: "Excluir",
};
</script>
<template>
  <section class="permission-summary" aria-label="Resumo das permissões">
    <h4>Revise o acesso antes de salvar</h4>
    <p>
      {{ permissions.sourceIds.length }} base(s) · {{ permissions.skills.length }} consulta(s) e
      operação(ões) · {{ permissions.administrative.length }} permissão(ões) administrativa(s).
    </p>
    <details>
      <summary>Ver detalhes do acesso selecionado</summary>
      <p>
        Este resumo acompanha suas escolhas. A autorização será conferida ao salvar e a cada uso.
      </p>
      <h5>Bases ({{ permissions.sourceIds.length }})</h5>
      <ul v-if="permissions.sourceIds.length">
        <li v-for="id in permissions.sourceIds" :key="id">
          {{ sources.find((source) => source.id === id)?.name ?? `Base não disponível (${id})` }}
        </li>
      </ul>
      <p v-else>Nenhuma base selecionada.</p>
      <h5>Consultas e operações ({{ permissions.skills.length }})</h5>
      <ul v-if="permissions.skills.length">
        <li v-for="skill in permissions.skills" :key="skill.skillId">
          <strong>{{
            publications[skill.skillId]?.package.name ?? `Skill não disponível (${skill.skillId})`
          }}</strong>
          ·
          {{
            skill.effects.map((effect) => effects[effect] ?? effect).join(", ") ||
            "Capacidades da skill"
          }}
          <span v-if="skill.requireHumanApproval"> · aprovação adicional exigida</span>
        </li>
      </ul>
      <p v-else>Nenhuma consulta ou operação selecionada.</p>
      <p>{{ permissions.externalOperationIds.length }} operação(ões) externa(s) autorizada(s).</p>
      <h5>Administração ({{ permissions.administrative.length }})</h5>
      <ul v-if="permissions.administrative.length">
        <li v-for="id in permissions.administrative" :key="id">
          {{ administrativeOptions.find((option) => option.id === id)?.label ?? id }}
        </li>
      </ul>
      <p v-else>Sem permissões administrativas.</p>
      <p v-if="permissions.managedIntegrationIds?.length">
        {{ permissions.managedIntegrationIds.length }} integração(ões) selecionada(s) para gestão.
      </p>
      <p class="field-help">
        Limites, finalidades por campo e regras de aprovação das skills continuam aplicáveis.
      </p>
    </details>
  </section>
</template>
