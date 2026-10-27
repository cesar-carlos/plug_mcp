<script setup lang="ts">
import type { ManagedIntegration } from "../../../src/domain/persona-v2/integration-management";
import { integrationManagementStatus } from "./integration-management";

defineProps<{
  rows: readonly ManagedIntegration[];
  selected: string;
}>();
const emit = defineEmits<{ change: [Event]; refresh: [] }>();
</script>
<template>
  <label
    >Integração a gerenciar<select :value="selected" @change="emit('change', $event)">
      <option value="">Selecione</option>
      <option v-for="row in rows" :key="row.id" :value="row.id">
        {{ row.name }} · {{ row.kind }} · {{ integrationManagementStatus(row) }} · credencial v{{
          row.version
        }}
      </option>
    </select></label
  >
  <button type="button" @click="emit('refresh')">Recarregar gestão de integrações</button>
  <p v-if="!rows.length">
    Nenhuma integração cadastrada. Cadastre uma conexão REST ou MCP remoto. Consumidores autorizados
    também podem solicitar um setup temporário.
  </p>
</template>
