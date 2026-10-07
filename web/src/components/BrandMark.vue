<script lang="ts">
export default { name: "BrandMark" };
</script>

<script setup lang="ts">
defineProps<{ compact?: boolean }>();

const logo = "/app/icon-192.png";
</script>

<template>
  <img :src="logo" alt="Se7e" class="brand" :class="{ compact: compact }" width="48" height="48" />
</template>
