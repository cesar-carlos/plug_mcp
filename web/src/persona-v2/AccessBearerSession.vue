<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { BEARER_REVEAL_MS } from "./access-workspace";

const props = defineProps<{
  disabled: boolean;
  run: (action: () => Promise<void>, form?: string) => Promise<void>;
}>();
const bearer = defineModel<string>("bearer", { required: true });
const emit = defineEmits<{
  status: [value: string];
}>();
const showBearer = ref(false);
let revealTimer: number | undefined;

onBeforeUnmount(() => {
  window.clearTimeout(revealTimer);
});

function revealBearer(): void {
  window.clearTimeout(revealTimer);
  showBearer.value = !showBearer.value;
  if (showBearer.value) {
    revealTimer = window.setTimeout(() => {
      showBearer.value = false;
    }, BEARER_REVEAL_MS);
  }
}

watch(bearer, () => {
  showBearer.value = false;
  window.clearTimeout(revealTimer);
});

async function copyBearer(): Promise<void> {
  await props.run(async () => {
    await navigator.clipboard.writeText(bearer.value);
    emit("status", "Token copiado. Guarde-o em local seguro.");
  });
}
</script>
<template>
  <h3>Usar e testar um token</h3>
  <p class="field-help">
    Cole um token existente ou copie o que acabou de emitir. O valor fica somente nesta sessão.
  </p>
  <label
    >Token para conectar o cliente ou testar<input
      v-model="bearer"
      :type="showBearer ? 'text' : 'password'"
      autocomplete="off"
      :disabled="disabled"
  /></label>
  <button :disabled="disabled || !bearer" @click="copyBearer">Copiar token</button>
  <button class="secondary" :disabled="disabled || !bearer" @click="revealBearer">
    {{ showBearer ? "Ocultar token" : "Revelar token" }}
  </button>
  <button class="secondary" :disabled="disabled || !bearer" @click="bearer = ''">
    Ocultar e descartar token
  </button>
  <p>Copie o token antes de sair; ele não é salvo no navegador.</p>
</template>
