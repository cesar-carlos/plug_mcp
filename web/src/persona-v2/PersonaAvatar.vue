<script setup lang="ts">
import { computed, ref, watch } from "vue";
const props = defineProps<{
  name: string;
  personaId: string;
  active: boolean;
  current?: { base: string; revision: number; hasIcon: boolean };
}>();
const failed = ref(false);
const src = computed(() =>
  props.active &&
  props.current?.base === `/api/admin/personas/${props.personaId}` &&
  props.current.hasIcon
    ? `/brand/personas/${props.personaId}/icon?v=${props.current.revision}`
    : "/brand/icon-192.png",
);
watch(src, () => {
  failed.value = false;
});
</script>
<template>
  <img
    v-if="!failed"
    :src="src"
    :alt="`Ícone salvo de ${name}`"
    width="64"
    height="64"
    class="persona-avatar"
    @error="failed = true"
  />
  <span
    v-else
    role="img"
    :aria-label="`Imagem indisponível de ${name}`"
    class="persona-avatar persona-avatar-fallback"
    >{{ name.trim().slice(0, 1).toLocaleUpperCase() || "?" }}</span
  >
</template>
<style scoped>
.persona-avatar {
  flex: 0 0 64px;
  object-fit: contain;
  border-radius: 12px;
}
.persona-avatar-fallback {
  display: grid;
  place-items: center;
  height: 64px;
  background: #e8f0eb;
  color: #174f32;
  font-size: 1.5rem;
  font-weight: bold;
}
</style>
