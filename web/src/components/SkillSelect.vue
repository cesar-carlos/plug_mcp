<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import { record, records, stringField } from "../validation";
import { useAction } from "../composables/useAction";
import ErrorBanner from "./ErrorBanner.vue";
const props = withDefaults(
  defineProps<{
    modelValue: string | string[];
    multiple?: boolean;
    publishedOnly?: boolean;
    label?: string;
    required?: boolean;
  }>(),
  { label: "Skill", multiple: false, publishedOnly: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string | string[]] }>();
const { error, pending, run } = useAction();
const options = ref<{ id: string; nome: string; status: string }[]>([]);
onMounted(() => {
  void run(async (bearer) => {
    const result = record(await api.get("/app/api/skills", bearer));
    options.value = records(result.skills).map((row) => ({
      id: stringField(row, "id"),
      nome: stringField(row, "nome"),
      status: stringField(row, "status"),
    }));
  });
});
const model = computed({
  get: () => props.modelValue,
  set: (value: string | string[]) => emit("update:modelValue", value),
});
const visibleOptions = computed(() =>
  options.value.filter(
    (row) =>
      !props.publishedOnly ||
      row.status === "publicada" ||
      (Array.isArray(props.modelValue)
        ? props.modelValue.includes(row.id)
        : props.modelValue === row.id),
  ),
);
const missing = computed(() =>
  (Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]).filter(
    (id) => id && !options.value.some((row) => row.id === id),
  ),
);
</script>
<template>
  <label
    >{{ label
    }}<select v-model="model" :multiple="multiple" :required="required" :disabled="pending">
      <option v-if="!multiple" value="">Somente grafo / sem skill selecionada</option>
      <option v-for="option in visibleOptions" :key="option.id" :value="option.id">
        {{ option.nome }} · {{ option.status }}
      </option>
      <option v-for="id in missing" :key="id" :value="id">
        Skill indisponível · {{ id }}
      </option></select
    ><span v-if="multiple" class="hint"
      >Selecione as skills publicadas que compõem este exemplo. Vínculos existentes são preservados;
      o servidor valida sua disponibilidade.</span
    ></label
  >
  <ErrorBanner :error="error" />
</template>
