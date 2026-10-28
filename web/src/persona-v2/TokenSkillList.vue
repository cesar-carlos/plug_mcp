<script setup lang="ts">
import { computed, ref } from "vue";
import { matchesSearch } from "./list-search";
import { tokenSourceGroup } from "./token-list";
import type { GrantPublication, Source } from "./model";
interface TokenSkillOption {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly details?: readonly string[];
}

const props = defineProps<{
  options: readonly TokenSkillOption[];
  publications?: Record<string, GrantPublication>;
  sources?: Source[];
}>();
const search = ref("");
const selectedOnly = ref(false);
const collapsedGroups = ref(new Set<string>());
const groups = computed(() => {
  const result = new Map<string, { key: string; label: string; options: TokenSkillOption[] }>();
  for (const option of props.options) {
    const source = tokenSourceGroup(props.publications?.[option.id], props.sources ?? []);
    const group = result.get(source.key) ?? { ...source, options: [] };
    group.options.push(option);
    result.set(source.key, group);
  }
  return [...result.values()].map((group) => ({
    ...group,
    selected: group.options.filter((option) => option.checked).length,
    visible: group.options.filter(
      (option) =>
        (!selectedOnly.value || option.checked) && matchesSearch(search.value, option.label),
    ),
  }));
});
const visibleCount = computed(() =>
  groups.value.reduce((sum, group) => sum + group.visible.length, 0),
);
function toggleGroup(key: string, event: Event): void {
  const next = new Set(collapsedGroups.value);
  if ((event.target as HTMLDetailsElement).open) next.delete(key);
  else next.add(key);
  collapsedGroups.value = next;
}
const expanded = ref(new Set<string>());
const detailedOptions = computed(() => props.options.filter((option) => option.details?.length));
function toggle(id: string, event: Event): void {
  const next = new Set(expanded.value);
  if ((event.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  expanded.value = next;
}
const emit = defineEmits<{
  change: [id: string, checked: boolean];
}>();
</script>
<template>
  <div class="token-detail-actions">
    <label
      >Buscar consultas e operações<input
        v-model="search"
        type="search"
        placeholder="Digite o nome"
    /></label>
    <label
      >Mostrar capacidades<select v-model="selectedOnly">
        <option :value="false">Todas</option>
        <option :value="true">Selecionadas</option>
      </select></label
    >
    <button
      v-if="search || selectedOnly"
      type="button"
      class="secondary"
      @click="
        search = '';
        selectedOnly = false;
      "
    >
      Limpar busca e filtro
    </button>
  </div>
  <p role="status">
    {{ visibleCount }} de {{ options.length }} capacidade(s) exibida(s) ·
    {{ options.filter((option) => option.checked).length }} selecionada(s) no total.
  </p>
  <p v-if="!visibleCount">
    Nenhuma capacidade corresponde aos filtros. Suas seleções foram preservadas.
  </p>
  <div v-if="detailedOptions.length" class="token-detail-actions">
    <button
      type="button"
      class="secondary"
      @click="expanded = new Set(detailedOptions.map((option) => option.id))"
    >
      Expandir campos
    </button>
    <button type="button" class="secondary" @click="expanded = new Set()">Recolher campos</button>
  </div>
  <details
    v-for="group in groups"
    v-show="group.visible.length"
    :key="group.key"
    class="token-form-section"
    :open="!collapsedGroups.has(group.key)"
    @toggle="toggleGroup(group.key, $event)"
  >
    <summary>
      {{ group.label }} · {{ group.selected }} de {{ group.options.length }} selecionada(s)
    </summary>
    <div v-for="option in group.visible" :key="option.id" class="token-skill-option">
      <label class="check"
        ><input
          type="checkbox"
          :checked="option.checked"
          :disabled="option.disabled"
          @change="emit('change', option.id, ($event.target as HTMLInputElement).checked)"
        />{{ option.label }}</label
      >
      <details
        v-if="option.details?.length"
        :open="expanded.has(option.id)"
        @toggle="toggle(option.id, $event)"
      >
        <summary>Finalidades por campo ({{ option.details.length }})</summary>
        <ul>
          <li v-for="detail in option.details" :key="detail">{{ detail }}</li>
        </ul>
      </details>
    </div>
  </details>
</template>
