<script setup lang="ts">
import { setTheme, themePreference } from "./use-theme";
function change(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "system" || value === "light" || value === "dark") {
    setTheme(value);
  }
}
</script>
<template>
  <label class="theme-select"
    >Aparência
    <select :value="themePreference" @change="change">
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Escuro</option>
    </select>
  </label>
</template>
