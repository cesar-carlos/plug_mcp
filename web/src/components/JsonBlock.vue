<script lang="ts">
export default { name: "JsonBlock" };
</script>

<script setup lang="ts">
defineProps<{ value: unknown }>();
</script>

<template>
  <pre class="code">{{ JSON.stringify(value, null, 2) }}</pre>
</template>
