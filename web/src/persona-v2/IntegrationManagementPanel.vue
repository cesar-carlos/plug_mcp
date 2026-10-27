<script setup lang="ts">
import IntegrationManagementForm from "./IntegrationManagementForm.vue";
import IntegrationManagementList from "./IntegrationManagementList.vue";
import IntegrationManagementReview from "./IntegrationManagementReview.vue";
import { useIntegrationManagement } from "./use-integration-management";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean] }>();
const {
  rows,
  review,
  selected,
  busy,
  mode,
  confirmed,
  needsReview,
  message,
  form,
  error,
  errorSummary,
  select,
  refresh,
  begin,
  save,
  clear,
  clearSecrets,
} = useIntegrationManagement(props, emit);
</script>
<template>
  <section aria-label="Gestão das integrações">
    <h2>Gerenciar integrações</h2>
    <p>
      Estado local e credenciais pertencem a esta persona. Suspensão e rotação não desfazem efeitos
      já enviados. Nenhuma ação aqui executa testes ou ferramentas externas.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="busy || disabled">
      <button type="button" :disabled="needsReview" @click="begin('criar')">
        Cadastrar integração
      </button>
      <IntegrationManagementList
        :rows="rows"
        :selected="selected"
        @change="select"
        @refresh="refresh"
      />
      <p v-if="needsReview">
        Confira a lista em Recarregar gestão de integrações antes de tentar novamente. Uma
        confirmação perdida pode já ter cadastrado a integração.
      </p>
      <IntegrationManagementReview v-if="review" :review="review" @begin="begin" />
      <IntegrationManagementForm
        v-if="mode"
        v-model:form="form"
        v-model:confirmed="confirmed"
        :mode="mode"
        :needs-review="needsReview"
        @submit="save"
        @discard="clear()"
        @clear-secrets="clearSecrets"
      />
    </fieldset>
  </section>
</template>
