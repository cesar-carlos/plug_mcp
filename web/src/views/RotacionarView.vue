<script lang="ts">
export default { name: "RotacionarView" };
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { completeSetup } from "../composables/useSetupForm";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import CredentialFields from "../components/CredentialFields.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const router = useRouter();
const { pending, error, run, success } = useAction();
const credenciais = ref({ email: "", senha: "" });
const confirmado = ref(false);
useUnsavedChanges(computed(() => Boolean(credenciais.value.email || credenciais.value.senha)));
onBeforeUnmount(() => {
  session.clearIssued();
});

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    if (!confirmado.value) {
      throw new Error("Confirme a operação.");
    }
    const result = await completeSetup(
      "/app/api/setup/rotacionar",
      { email: credenciais.value.email, senha: credenciais.value.senha },
      bearer,
    );
    if (result.token) {
      credenciais.value = { email: "", senha: "" };
      confirmado.value = false;
      await router.push({ name: "bearer" });
      session.rememberIssued(result.token);
    }
  });
};
</script>

<template>
  <Page
    title="Rotacionar Token MCP"
    lead="Emite outro token para esta mesma persona."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <form class="card" @submit.prevent="save">
      <p class="callout warn">
        O Token MCP atual vale até este envio concluir. Depois só o token novo autentica esta
        persona.
      </p>
      <fieldset class="section">
        <legend>Conta do hub</legend>
        <CredentialFields v-model="credenciais" senha-label="Senha do hub" />
      </fieldset>
      <ConfirmField
        v-model="confirmado"
        label="Confirmo invalidar o Token MCP atual desta persona"
      />
      <div class="form-actions">
        <button type="submit" :disabled="pending || !confirmado">Emitir novo token MCP</button>
      </div>
    </form>
  </Page>
</template>
