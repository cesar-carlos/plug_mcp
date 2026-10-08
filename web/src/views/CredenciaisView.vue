<script lang="ts">
export default { name: "CredenciaisView" };
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { completeSetup } from "../composables/useSetupForm";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import CredentialFields from "../components/CredentialFields.vue";
import ConfirmField from "../components/ConfirmField.vue";

const { pending, error, run, success } = useAction();
const credenciais = ref({ email: "", senha: "" });
const confirmado = ref(false);
const done = ref(false);
useUnsavedChanges(computed(() => Boolean(credenciais.value.email || credenciais.value.senha)));

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
    credenciais.value = { email: "", senha: "" };
    confirmado.value = false;
  });
};
</script>

<template>
  <Page
    title="Credenciais do hub"
    lead="A senha só viaja no POST de /setup. Reautentica o mesmo Client."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <p v-if="done" class="ok">Credenciais atualizadas no hub e no cofre.</p>
    <form class="card" @submit.prevent="save">
      <fieldset class="section">
        <legend>Conta do hub</legend>
        <CredentialFields v-model="credenciais" senha-label="Senha do hub" />
      </fieldset>
      <ConfirmField v-model="confirmado" label="Confirmo atualizar as credenciais deste Client" />
      <div class="form-actions">
        <button type="submit" :disabled="pending || !confirmado">Salvar credenciais</button>
      </div>
    </form>
  </Page>
</template>
