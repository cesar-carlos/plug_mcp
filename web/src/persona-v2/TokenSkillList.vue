<script setup lang="ts">
interface TokenSkillOption {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly details?: readonly string[];
}

defineProps<{
  options: readonly TokenSkillOption[];
}>();
const emit = defineEmits<{
  change: [id: string, checked: boolean];
}>();
</script>
<template>
  <div v-for="option in options" :key="option.id">
    <label class="check"
      ><input
        type="checkbox"
        :checked="option.checked"
        :disabled="option.disabled"
        @change="emit('change', option.id, ($event.target as HTMLInputElement).checked)"
      />{{ option.label }}</label
    >
    <ul v-if="option.details?.length">
      <li v-for="detail in option.details" :key="detail">{{ detail }}</li>
    </ul>
  </div>
</template>
