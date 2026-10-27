<script setup lang="ts">
import {
  integrationManagementConfirmLabel,
  integrationManagementSubmitLabel,
  type IntegrationManagementAction,
  type IntegrationManagementForm,
} from "./integration-management";

defineProps<{
  mode: IntegrationManagementAction;
  needsReview: boolean;
}>();
const form = defineModel<IntegrationManagementForm>("form", { required: true });
const confirmed = defineModel<boolean>("confirmed", { required: true });
const emit = defineEmits<{
  submit: [];
  discard: [];
  clearSecrets: [];
}>();
</script>
<template>
  <form aria-label="Confirmar mudança da integração" @submit.prevent="emit('submit')">
    <template v-if="mode === 'criar'">
      <h3>Nova integração</h3>
      <p>
        O cadastro guarda a credencial cifrada. Não verifica o provedor nem habilita operações. Use
        um destino HTTPS público sem credenciais ou parâmetros na URL.
      </p>
      <label>Nome da integração<input v-model="form.name" required maxlength="200" /></label>
      <label
        >Tipo da integração<select v-model="form.kind">
          <option value="rest">REST</option>
          <option value="mcp_http">MCP remoto (Streamable HTTP)</option>
        </select></label
      >
      <label
        >Destino HTTPS da integração<input
          v-model="form.destination"
          type="url"
          required
          maxlength="2048"
          autocomplete="off"
      /></label>
    </template>
    <p v-if="mode !== 'criar'">
      Publicações dependentes e operações antigas permanecerão desativadas. Recuperar não restaura
      concessões. Rotacionar preserva nome, tipo, destino e eventual suspensão; não verifica a
      credencial no provedor.
    </p>
    <p v-if="mode && mode !== 'criar'" class="notice">
      Tokens existentes não receberão novos acessos. Consumidores das publicações acima perderão a
      disponibilidade desta integração; efeitos já executados não serão desfeitos. Revise as
      dependências e os comprovantes antes de confirmar.
    </p>
    <template v-if="mode === 'rotacionar' || mode === 'criar'">
      <label
        >E-mail do responsável para reautenticação<input
          v-model="form.ownerEmail"
          type="email"
          required
          autocomplete="username"
          maxlength="320"
      /></label>
      <label
        >Senha do responsável para reautenticação<input
          v-model="form.ownerPassword"
          type="password"
          required
          autocomplete="current-password"
          maxlength="1024"
      /></label>
      <label
        >Tipo da nova credencial<select v-model="form.type" @change="emit('clearSecrets')">
          <option value="bearer">Bearer</option>
          <option value="api_key">API key em header</option>
          <option value="basic">Basic</option>
        </select></label
      >
      <label v-if="form.type === 'bearer'"
        >Novo Bearer da integração<input
          v-model="form.token"
          type="password"
          autocomplete="off"
          required
          maxlength="8192"
      /></label>
      <template v-else-if="form.type === 'api_key'"
        ><label>Header da API key<input v-model="form.header" required maxlength="100" /></label
        ><label
          >Nova API key<input
            v-model="form.apiKey"
            type="password"
            autocomplete="off"
            required
            maxlength="8192" /></label
      ></template>
      <template v-else
        ><label
          >Usuário técnico Basic<input
            v-model="form.username"
            autocomplete="off"
            required
            maxlength="8192" /></label
        ><label
          >Nova senha técnica Basic<input
            v-model="form.password"
            type="password"
            autocomplete="off"
            required
            maxlength="8192" /></label
      ></template>
    </template>
    <label
      ><input v-model="confirmed" type="checkbox" />{{
        integrationManagementConfirmLabel(mode)
      }}</label
    >
    <p v-if="needsReview">
      A confirmação pode ter sido perdida ou o estado alterado. Recarregue e revise antes de outra
      mudança.
    </p>
    <button :disabled="!confirmed || needsReview">
      {{ integrationManagementSubmitLabel(mode) }}
    </button>
    <button type="button" @click="emit('discard')">Descartar mudança da integração</button>
  </form>
</template>
