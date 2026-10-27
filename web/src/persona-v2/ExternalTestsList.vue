<script setup lang="ts">
import type { ExternalTestSkill } from "./external-tests";

defineProps<{
  skills: readonly ExternalTestSkill[];
  skillId?: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ select: [string] }>();
</script>
<template>
  <p v-if="!skillId && !skills.length">Nenhuma skill externa cadastrada.</p>
  <ul>
    <li v-for="skill in skills" :key="skill.skillId">
      <button class="secondary" :disabled="disabled" @click="emit('select', skill.skillId)">
        {{ skill.name }} · revisão {{ skill.revision }}
      </button>
    </li>
  </ul>
</template>
