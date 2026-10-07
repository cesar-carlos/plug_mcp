<script lang="ts">
export default { name: "DialetoSelect" };
</script>

<script setup lang="ts">
const dialeto = defineModel<string>({ required: true });
</script>

<template>
  <label>
    Dialeto
    <select v-model="dialeto">
      <option value="mssql">SQL Server (mssql)</option>
      <option value="sybase">SQL Anywhere (sybase)</option>
      <option value="postgres">Postgres</option>
      <option value="firebird">Firebird</option>
    </select>
  </label>
</template>
