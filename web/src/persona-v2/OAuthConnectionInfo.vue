<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { lazyPanel } from "./lazy-panel";
const MascotGallery = lazyPanel(() => import("./MascotGallery.vue"));
const showMascots = ref(false);
const props = defineProps<{ api: <T>(url: string, body?: unknown) => Promise<T> }>();
const status = ref<{ enabled: boolean; endpoint?: string; scope?: string }>();
const message = ref("");
const loading = ref(false);
const error = ref("");
let active = true;
onBeforeUnmount(() => {
  active = false;
  status.value = undefined;
});
async function load() {
  if (loading.value || !active) return;
  loading.value = true;
  error.value = "";
  message.value = "";
  try {
    const result = await props.api<NonNullable<typeof status.value>>("/api/admin/oauth");
    if (active) status.value = result;
  } catch {
    if (active) error.value = "Não foi possível confirmar a disponibilidade do OAuth.";
  } finally {
    if (active) loading.value = false;
  }
}
onMounted(load);
async function copy() {
  if (!status.value?.enabled) return;
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(
        {
          url: status.value.endpoint,
          transport: "streamable-http",
          authentication: "OAuth 2.1",
          scope: status.value.scope,
        },
        null,
        2,
      ),
    );
    if (active) message.value = "Endereço OAuth copiado, sem token.";
  } catch {
    if (active) message.value = "Não foi possível copiar. Use o endereço mostrado.";
  }
}
</script>
<template>
  <section
    id="access-chatgpt"
    role="tabpanel"
    aria-label="Conexão ChatGPT"
    :aria-busy="loading"
    class="access-card"
    tabindex="-1"
  >
    <h3>Conectar no ChatGPT</h3>
    <template v-if="status?.enabled">
      <p class="field-help">Use uma conexão privada e autorize somente o acesso necessário.</p>
      <div class="access-endpoint">
        <span>Endereço da conexão</span><code>{{ status.endpoint }}</code>
      </div>
      <ol class="access-steps">
        <li>Use este endereço na conexão privada do ChatGPT.</li>
        <li>Confirme a persona no navegador e selecione as bases e skills concedidas.</li>
        <li>Informe o token apenas no formulário protegido, nunca na conversa.</li>
      </ol>
      <button type="button" class="secondary" @click="copy">Copiar endereço OAuth sem token</button>
      <details>
        <summary>Como a conexão e as permissões funcionam</summary>
        <p>
          O plugin usa o ID real dessa conexão. Este console não instala nem altera conexões
          existentes. Cadastro e rotação de credenciais podem iniciar pelo plugin com delegação e
          consentimento explícitos; os segredos e a autenticação do responsável ficam no navegador.
          Aprovação humana de operações continua exclusiva do responsável.
        </p>
      </details>
    </template>
    <p v-else-if="status">
      OAuth indisponível neste ambiente. A conexão manual usa o endereço /mcp e as permissões do
      token.
    </p>
    <p v-else-if="loading" role="status">Conferindo disponibilidade do OAuth…</p>
    <template v-if="error">
      <p role="alert" class="error">{{ error }}</p>
      <button type="button" class="secondary" :disabled="loading" @click="load">
        Tentar novamente
      </button>
    </template>
    <p v-if="message" role="status">{{ message }}</p>
    <details>
      <summary>Ícone, mascotes e Dots</summary>
      <p>
        Para trocar o ícone desta persona, abra Visão geral → Editar persona. Os mascotes abaixo têm
        retrato estático e animação para download. Eles não alteram as permissões da conexão.
      </p>
      <button
        type="button"
        class="secondary"
        :aria-expanded="showMascots"
        @click="showMascots = !showMascots"
      >
        {{ showMascots ? "Fechar downloads de mascotes" : "Ver mascotes para download" }}
      </button>
      <MascotGallery v-if="showMascots" />
    </details>
  </section>
</template>
