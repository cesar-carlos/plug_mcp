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
    <header class="page-head">
      <div>
        <h1>{{ title }}</h1>
        <p v-if="lead" class="lead">{{ lead }}</p>
      </div>
      <div v-if="$slots.actions" class="page-actions">
        <slot name="actions" />
      </div>
    </header>
    <ErrorBanner :error="error" />
    <slot />
  </div>
</template>
