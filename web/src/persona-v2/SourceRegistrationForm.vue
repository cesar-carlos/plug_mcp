<script setup lang="ts">
import type { SourceForm } from "./source-form";

defineProps<{
  busy: boolean;
  invalidField: (field: string) => boolean;
  replacementName?: string;
}>();
const form = defineModel<SourceForm>("form", { required: true });
const confirmed = defineModel<boolean>("replacementConfirmed", { required: true });
const emit = defineEmits<{
  submit: [];
  cancel: [];
}>();
</script>
<template>
  <form
    id="source-registration"
    tabindex="-1"
    :aria-label="replacementName ? 'Cadastrar base substituta' : 'Cadastrar base'"
    @submit.prevent="emit('submit')"
  >
    <fieldset :disabled="busy">
      <label
        >Nome da base<input
          v-model="form.name"
          data-error-field="sources:name"
          :aria-invalid="invalidField('name') || undefined"
          :aria-describedby="invalidField('name') ? 'sources-name-error' : undefined"
          maxlength="200"
          required
      /></label>
      <p v-if="invalidField('name')" id="sources-name-error" class="error">Revise este campo.</p>
      <label
        >Para que essa base será usada?<textarea
          v-model="form.purpose"
          data-error-field="sources:purpose"
          :aria-invalid="invalidField('purpose') || undefined"
          :aria-describedby="invalidField('purpose') ? 'sources-purpose-error' : undefined"
          maxlength="5000"
          required
        />
      </label>
      <p v-if="invalidField('purpose')" id="sources-purpose-error" class="error">
        Revise este campo.
      </p>
      <label
        >Ambiente<select
          v-model="form.environment"
          data-error-field="sources:environment"
          :aria-invalid="invalidField('environment') || undefined"
          :aria-describedby="invalidField('environment') ? 'sources-environment-error' : undefined"
        >
          <option>desenvolvimento</option>
          <option>homologação</option>
          <option>produção</option>
        </select></label
      >
      <p v-if="invalidField('environment')" id="sources-environment-error" class="error">
        Revise este campo.
      </p>
      <label
        >AGENT_ID<input
          v-model="form.agentId"
          data-error-field="sources:agentId"
          :aria-invalid="invalidField('agentId') || undefined"
          :aria-describedby="invalidField('agentId') ? 'sources-agentId-error' : undefined"
          required
      /></label>
      <p v-if="invalidField('agentId')" id="sources-agentId-error" class="error">
        Revise este campo.
      </p>
      <label
        >CLIENT_EMAIL<input
          v-model="form.email"
          data-error-field="sources:email"
          :aria-invalid="invalidField('email') || undefined"
          :aria-describedby="invalidField('email') ? 'sources-email-error' : undefined"
          type="email"
          autocomplete="off"
          required
      /></label>
      <p v-if="invalidField('email')" id="sources-email-error" class="error">Revise este campo.</p>
      <label
        >CLIENT_PASSWORD<input
          v-model="form.password"
          data-error-field="sources:password"
          :aria-invalid="invalidField('password') || undefined"
          :aria-describedby="invalidField('password') ? 'sources-password-error' : undefined"
          type="password"
          autocomplete="off"
          required
      /></label>
      <p v-if="invalidField('password')" id="sources-password-error" class="error">
        Revise este campo.
      </p>
      <label
        >CLIENT_TOKEN<input
          v-model="form.clientToken"
          data-error-field="sources:clientToken"
          :aria-invalid="invalidField('clientToken') || undefined"
          :aria-describedby="invalidField('clientToken') ? 'sources-clientToken-error' : undefined"
          type="password"
          autocomplete="off"
          required
      /></label>
      <p v-if="invalidField('clientToken')" id="sources-clientToken-error" class="error">
        Revise este campo.
      </p>
      <label
        >DIALETO<select
          v-model="form.dialect"
          data-error-field="sources:dialect"
          :aria-invalid="invalidField('dialect') || undefined"
          :aria-describedby="invalidField('dialect') ? 'sources-dialect-error' : undefined"
        >
          <option value="mssql">SQL Server</option>
          <option value="postgres">PostgreSQL</option>
          <option value="sybase">SQL Anywhere</option>
        </select></label
      >
      <p v-if="invalidField('dialect')" id="sources-dialect-error" class="error">
        Revise este campo.
      </p>
      <p>
        O banco será identificado pela autorização do agente. Credenciais ficam cifradas no
        servidor.
      </p>
      <p>
        Depois de conectar, selecione abaixo o ERP / padrão de estrutura e confira a compatibilidade
        pelo agente. Essa etapa é opcional; treinamento privado continua disponível. Uma base
        substituta exige nova inspeção, sem herdar vínculos.
      </p>
      <template v-if="replacementName">
        <p>
          O vínculo anterior será preservado e ficará bloqueado. Treinamento, permissões e operações
          não serão transferidos.
        </p>
        <label
          ><input v-model="confirmed" type="checkbox" />Confirmo o cadastro independente desta base
          substituta.</label
        >
      </template>
      <button :disabled="!!replacementName && !confirmed">
        {{ replacementName ? "Verificar e substituir base" : "Conectar base" }}
      </button>
      <button v-if="replacementName" type="button" @click="emit('cancel')">
        Cancelar substituição
      </button>
    </fieldset>
  </form>
</template>
