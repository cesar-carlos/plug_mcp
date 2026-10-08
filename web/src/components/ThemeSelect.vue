<script setup lang="ts">
import { setTheme, themePreference, type ThemePreference } from "../composables/useTheme";
const change = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  if (["system", "light", "dark"].includes(value)) {
    setTheme(value as ThemePreference);
  }
};
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
