<script setup lang="ts">
import { RouterLink } from "vue-router";
import { consoleAreas, consoleGroups, type ConsoleArea } from "./navigation";

defineProps<{
  area: ConsoleArea;
  nextStepArea?: ConsoleArea;
  busy: boolean;
  expanded: boolean;
}>();
const emit = defineEmits<{ toggle: []; logout: [] }>();
</script>
<template>
  <nav aria-label="Áreas do console" class="console-navigation">
    <button
      class="mobile-menu secondary"
      aria-label="Menu"
      :aria-expanded="expanded"
      aria-controls="console-menu"
      @click="emit('toggle')"
    >
      Menu
      <span class="mobile-area"> · {{ consoleAreas.find((item) => item.id === area)?.label }}</span>
    </button>
    <div id="console-menu" class="console-menu" :class="{ expanded }">
      <div v-for="group in consoleGroups" :key="group.label" class="navigation-group">
        <p class="navigation-group-title">{{ group.label }}</p>
        <RouterLink
          v-for="id in group.areas"
          :key="id"
          :to="{ name: id }"
          :aria-current="area === id ? 'page' : undefined"
          :class="{ 'nav-next-step': nextStepArea === id }"
          >{{ consoleAreas.find((item) => item.id === id)?.label
          }}<span v-if="nextStepArea === id" aria-hidden="true"> · próximo passo</span></RouterLink
        >
      </div>
      <button type="button" class="navigation-logout" :disabled="busy" @click="emit('logout')">
        Sair
      </button>
    </div>
  </nav>
</template>
