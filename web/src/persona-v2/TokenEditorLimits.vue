<script setup lang="ts">
import LimitsEditor from "./LimitsEditor.vue";
import type { GrantPublication } from "./model";
import type { TokenPermissions } from "./token-permissions";

defineProps<{
  publications: Record<string, GrantPublication>;
}>();
const permissions = defineModel<TokenPermissions>("permissions", { required: true });
const delegation = defineModel<TokenPermissions>("delegation", { required: true });
</script>
<template>
  <details>
    <summary>Limites do token e da delegação</summary>
    <LimitsEditor v-model="permissions.queryLimits" kind="query" label="Consultas deste token" />
    <LimitsEditor
      v-model="permissions.operationLimits"
      kind="operation"
      label="Lançamentos deste token"
    />
    <LimitsEditor
      v-model="permissions.federationLimits"
      kind="federation"
      label="Cruzamentos deste token"
    />
    <LimitsEditor
      v-model="delegation.queryLimits"
      kind="query"
      label="Teto para delegar consultas"
    />
    <LimitsEditor
      v-model="delegation.operationLimits"
      kind="operation"
      label="Teto para delegar lançamentos"
    />
    <LimitsEditor
      v-model="delegation.federationLimits"
      kind="federation"
      label="Teto para delegar cruzamentos"
    />
    <div v-for="g in delegation.skills" :key="g.skillId">
      <p>{{ publications[g.skillId]?.package.name ?? g.skillId }}</p>
      <LimitsEditor v-model="g.queryLimits" kind="query" label="Delegação desta consulta" />
      <LimitsEditor
        v-model="g.operationLimits"
        kind="operation"
        label="Delegação deste lançamento"
      />
      <LimitsEditor
        v-model="g.federationLimits"
        kind="federation"
        label="Delegação deste cruzamento"
      />
    </div>
  </details>
</template>
