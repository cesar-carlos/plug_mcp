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
      <option value="mssql">mssql</option>
      <option value="sybase">sybase</option>
      <option value="postgres">postgres</option>
      <option value="firebird">firebird</option>
    </select>
  </label>
</template>
