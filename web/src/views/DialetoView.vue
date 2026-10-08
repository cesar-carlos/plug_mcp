<script lang="ts">
export default { name: "DialetoView" };
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import DialetoSelect from "../components/DialetoSelect.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const { pending, error, run, success } = useAction();
const dialeto = ref(session.acesso?.dialeto ?? "");
const original = ref(dialeto.value);
useUnsavedChanges(computed(() => dialeto.value !== original.value));
const confirmado = ref(false);

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/acesso/dialeto",
      { dialeto: dialeto.value, confirmadoPeloUsuario: confirmado.value },
      bearer,
    );
    await session.refreshAcesso();
    original.value = dialeto.value;
    confirmado.value = false;
  });
};
</script>

<template>
  <Page
    title="Dialeto"
    lead="A tela não descobre o GDBR. A troca vale só para este acesso."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <form class="card" @submit.prevent="save">
      <p class="callout warn">
        Trocar o dialeto devolve as skills deste acesso a rascunho. A tela não descobre o GDBR
        sozinha.
      </p>
      <DialetoSelect v-model="dialeto" />
      <ConfirmField v-model="confirmado" label="Confirmo trocar o dialeto e rebaixar as skills" />
      <div class="form-actions">
        <button type="submit" :disabled="pending || !confirmado || !dialeto">Salvar dialeto</button>
      </div>
    </form>
  </Page>
</template>
