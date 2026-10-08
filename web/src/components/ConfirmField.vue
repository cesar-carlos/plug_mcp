<script lang="ts">
export default { name: "ConfirmField" };
</script>

<script setup lang="ts">
defineProps<{ modelValue: boolean; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const checkedFrom = (event: { target: unknown }): boolean | undefined => {
  const target = event.target;
  if (typeof target !== "object" || target === null || !("checked" in target)) {
    return undefined;
  }
  const checked = target.checked;
  return typeof checked === "boolean" ? checked : undefined;
};

const onChange = (event: { target: unknown }): void => {
  const checked = checkedFrom(event);
  if (checked !== undefined) {
    emit("update:modelValue", checked);
  }
};
</script>

<template>
  <label class="choice">
    <input type="checkbox" :checked="modelValue" @change="onChange" />
    <span>{{ label ?? "Confirmo esta operação no acesso informado" }}</span>
  </label>
</template>
