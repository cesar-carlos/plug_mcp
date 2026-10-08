<script lang="ts">
export default { name: "StatusPill" };
</script>

<script setup lang="ts">
import type { StatusTone } from "../presentation";

defineProps<{
  label: string;
  tone?: StatusTone;
}>();
</script>

<template>
  <span class="pill" :class="tone ?? 'neutral'">{{ label }}</span>
</template>
