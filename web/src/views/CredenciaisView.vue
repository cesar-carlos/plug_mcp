<script lang="ts">
export default { name: "CredenciaisView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { completeSetup } from "../composables/useSetupForm";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import CredentialFields from "../components/CredentialFields.vue";
import ConfirmField from "../components/ConfirmField.vue";

const { pending, error, run } = useAction();
const credenciais = ref({ email: "", senha: "" });
const confirmado = ref(false);
const done = ref(false);

const save = async (): Promise<void> => {
  done.value = false;
  await run(async (bearer) => {
    if (!confirmado.value) {
      throw new Error("Confirme a operação.");
    }
    await completeSetup(
      "/app/api/setup/credenciais",
      { email: credenciais.value.email, senha: credenciais.value.senha },
      bearer,
    );
    done.value = true;
  });
};
</script>

<template>
  <Page
    title="Credenciais do hub"
    lead="A senha só viaja no POST de /setup. Reautentica o mesmo Client."
    :error="error"
  >
    <p v-if="done" class="ok">Credenciais atualizadas no hub e no cofre.</p>
    <form class="card" @submit.prevent="save">
      <CredentialFields v-model="credenciais" />
      <ConfirmField v-model="confirmado" />
      <button type="submit" :disabled="pending">Atualizar</button>
    </form>
  </Page>
</template>
