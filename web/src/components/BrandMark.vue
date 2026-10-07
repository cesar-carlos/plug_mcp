<script lang="ts">
export default { name: "BrandMark" };
</script>

<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>

<template>
  <img
    src="/app/icon-192.png"
    alt="Se7e"
    class="brand"
    :class="{ compact: compact }"
    width="48"
    height="48"
  />
</template>
