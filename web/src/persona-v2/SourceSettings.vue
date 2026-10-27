<script setup lang="ts">
import type { Source, SourceRestriction } from "./model";
import SourceCredentialsForm from "./SourceCredentialsForm.vue";
import SourceImpactReview from "./SourceImpactReview.vue";
import SourceSettingsForm from "./SourceSettingsForm.vue";
import { useSourceSettings } from "./use-source-settings";

const props = defineProps<{
  source: Source;
  busy: boolean;
  base: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{
  save: [
    input: {
      expectedVersion: number;
      name: string;
      purpose: string;
      environment: string;
      rowRestrictions: SourceRestriction[];
    },
  ];
  rotate: [
    input: { expectedVersion: number; email: string; password: string; clientToken: string },
  ];
  dirty: [value: boolean];
  reload: [];
  lock: [value: boolean];
}>();
const {
  expectedVersion,
  form,
  restrictions,
  credentials,
  impact,
  pending,
  confirmed,
  error,
  errorSummary,
  identityDirty,
  review,
  confirmChange,
  continueEditing,
} = useSourceSettings(props, emit);
</script>

<template>
  <p v-if="!source.active" class="notice">
    {{
      source.replacedBySourceId
        ? "Cadastro anterior preservado no histórico."
        : "Base suspensa. Revise a recuperação ou substituição abaixo."
    }}
  </p>
  <details v-else>
    <summary>Gerenciar {{ source.name }}</summary>
    <p>
      Agente: {{ source.agentId }} · Banco confirmado: {{ source.database }} · {{ source.dialect }}
    </p>
    <p v-if="source.authorizationVersion !== expectedVersion" class="notice">
      O cadastro mudou. Sua edição foi preservada; recarregue a base para revisar a versão atual.
    </p>
    <button type="button" :disabled="busy" @click="emit('reload')">Recarregar base</button>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <SourceSettingsForm
      v-model:form="form"
      v-model:restrictions="restrictions"
      :busy="busy"
      :source-name="source.name"
      :identity-dirty="identityDirty"
      @submit="review('save')"
    />
    <details>
      <summary>Trocar credenciais</summary>
      <SourceCredentialsForm
        v-model:credentials="credentials"
        :busy="busy"
        :source-name="source.name"
        @submit="review('rotate')"
      />
    </details>
    <SourceImpactReview
      v-if="impact && pending"
      v-model:confirmed="confirmed"
      :impact="impact"
      :pending="pending"
      :source="source"
      :busy="busy"
      @confirm="confirmChange"
      @continue="continueEditing"
    />
  </details>
</template>
