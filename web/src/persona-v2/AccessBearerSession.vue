<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { BEARER_REVEAL_MS } from "./access-workspace";

const props = defineProps<{
  disabled: boolean;
  generated?: boolean;
}>();
const bearer = defineModel<string>("bearer", { required: true });
const emit = defineEmits<{
  status: [value: string];
  manage: [];
  create: [];
}>();
const showBearer = ref(false);
const copied = ref(false);
const copyError = ref(false);
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
  copied.value = false;
  copyError.value = false;
  showBearer.value = false;
  window.clearTimeout(revealTimer);
});

async function copyBearer(): Promise<void> {
  if (props.disabled || !bearer.value) return;
  const current = bearer.value;
  copyError.value = false;
  try {
    await navigator.clipboard.writeText(current);
    if (bearer.value !== current) return;
    copied.value = true;
    emit("status", "Token copiado. Guarde-o em local seguro.");
  } catch {
    if (bearer.value === current) copyError.value = true;
  }
}
</script>
<template>
  <h3>
    {{ generated && bearer ? "Token gerado — copie e guarde agora" : "Copiar ou usar token" }}
  </h3>
  <p v-if="bearer">
    Copie o token e cole no aplicativo que vai acessar esta persona. Ao sair ou atualizar a página,
    este valor será descartado e não poderá ser consultado novamente.
  </p>
  <template v-else>
    <p role="status"><strong>Nenhum token disponível para copiar nesta sessão.</strong></p>
    <p>
      A lista mostra os acessos cadastrados, mas não guarda o valor secreto. Se não o copiou, abra
      <strong>Tokens cadastrados → Editar → Gerar novo token</strong>. Isso invalida o valor
      anterior e os acessos derivados dele.
    </p>
    <button type="button" :disabled="disabled" @click="emit('manage')">
      Ir para tokens cadastrados
    </button>
    <button type="button" class="secondary" :disabled="disabled" @click="emit('create')">
      Criar outro acesso
    </button>
    <p>Já guardou seu token? Cole no campo abaixo para usar.</p>
  </template>
  <label
    >Token para conectar o cliente ou testar<input
      v-model="bearer"
      :type="showBearer ? 'text' : 'password'"
      autocomplete="off"
      :disabled="disabled"
  /></label>
  <template v-if="bearer">
    <button :disabled="disabled" @click="copyBearer">
      {{ copied ? "Copiar token novamente" : "Copiar token" }}
    </button>
    <button class="secondary" :disabled="disabled || !bearer" @click="revealBearer">
      {{ showBearer ? "Ocultar token" : "Revelar token" }}
    </button>
    <p v-if="copied" role="status">Token copiado. Guarde-o em um local seguro antes de sair.</p>
    <p v-if="copyError" role="alert">
      Não foi possível copiar automaticamente. Clique em Revelar token e copie o campo manualmente.
    </p>
    <details>
      <summary>Remover token desta página</summary>
      <p>Descarta apenas o valor desta sessão. Não revoga o acesso cadastrado.</p>
      <button class="secondary" :disabled="disabled" @click="bearer = ''">
        Ocultar e descartar token
      </button>
    </details>
  </template>
</template>
