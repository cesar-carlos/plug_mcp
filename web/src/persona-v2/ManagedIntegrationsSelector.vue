<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  modelValue?: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();
const connections = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const loading = ref(false);
let generation = 0;
onBeforeUnmount(() => generation++);
const options = computed(() => {
  const names = new Map(connections.value.map((item) => [item.id, item.name]));
  for (const id of props.modelValue ?? []) {
    if (!names.has(id)) names.set(id, `Integração indisponível (${id})`);
  }
  return [...names].map(([id, name]) => ({ id, name }));
});
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  connections.value = [];
  try {
    const result = await props.api<{ connections: { id: string; name: string }[] }>(
      `${props.base}/integracoes/gestao`,
    );
    if (current === generation) connections.value = result.connections;
  } catch (cause) {
    if (current === generation)
      error.value = cause instanceof Error ? cause.message : "Não foi possível listar integrações.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(() => props.base, load, { immediate: true });
function toggle(id: string, checked: boolean) {
  const selected = props.modelValue ?? [];
  emit(
    "update:modelValue",
    checked ? [...new Set([...selected, id])] : selected.filter((v) => v !== id),
  );
}
</script>

<template>
  <fieldset :disabled="disabled || loading">
    <legend>Integrações para administração</legend>
    <p>Selecione explicitamente. Administrar não concede execução de operações.</p>
    <p v-if="loading" role="status">Carregando integrações…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" type="button" @click="load">Recarregar integrações</button>
    <label v-for="item in options" :key="item.id">
      <input
        type="checkbox"
        :checked="modelValue?.includes(item.id) ?? false"
        @change="toggle(item.id, ($event.target as HTMLInputElement).checked)"
      />
      Administrar {{ item.name }}
    </label>
    <p v-if="!loading && !error && !options.length">Nenhuma integração cadastrada.</p>
  </fieldset>
</template>
