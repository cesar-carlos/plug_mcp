<script lang="ts">
export default { name: "Page" };
</script>

<script setup lang="ts">
import ErrorBanner from "./ErrorBanner.vue";
import ActionStatus from "./ActionStatus.vue";

defineProps<{
  title: string;
  lead?: string;
  error?: unknown;
  pending?: boolean;
  success?: boolean;
}>();
</script>

<template>
  <div class="page" :aria-busy="pending || false">
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
    <ActionStatus :pending="pending" :success="success" />
    <div :inert="pending || undefined"><slot /></div>
  </div>
</template>
