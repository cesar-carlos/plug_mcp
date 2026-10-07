<script lang="ts">
export default { name: "Page" };
</script>

<script setup lang="ts">
import ErrorBanner from "./ErrorBanner.vue";

defineProps<{
  title: string;
  lead?: string;
  error?: unknown;
}>();
</script>

<template>
  <div>
    <h1>{{ title }}</h1>
    <p v-if="lead">{{ lead }}</p>
    <ErrorBanner :error="error" />
    <slot />
  </div>
</template>
