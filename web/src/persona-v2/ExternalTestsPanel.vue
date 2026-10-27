<script setup lang="ts">
import type { ExternalTestDetails } from "../../../src/domain/persona-v2/external-run";
import ExternalTestCaseForm from "./ExternalTestCaseForm.vue";
import ExternalTestReports from "./ExternalTestReports.vue";
import ExternalTestsList from "./ExternalTestsList.vue";
import { externalTestCaseName, externalTestsApprovalLabel } from "./external-tests";
import { useExternalTests } from "./use-external-tests";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  skillId?: string;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; updated: [ExternalTestDetails] }>();
const {
  skills,
  details,
  busy,
  message,
  name,
  required,
  caseId,
  removeConfirmed,
  editing,
  input,
  expected,
  error,
  errorSummary,
  dirty,
  refreshTests,
  select,
  edit,
  save,
  close,
  more,
} = useExternalTests(props, emit);
</script>
<template>
  <section aria-label="Casos e relatórios externos">
    <h2>Casos e relatórios de integrações</h2>
    <p>
      Use somente dados sintéticos. O operador executa os testes em fixture isolada; este painel não
      envia ações ao serviço.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <button class="secondary" :disabled="busy || disabled" @click="refreshTests">
      Atualizar skills externas
    </button>
    <ExternalTestsList
      :skills="skills"
      :skill-id="skillId"
      :disabled="busy || disabled"
      @select="select"
    />
    <section v-if="details" aria-label="Testes da skill externa">
      <h3>{{ details.name }} · revisão {{ details.revision }}</h3>
      <p>{{ externalTestsApprovalLabel(details.requiredApproved) }}</p>
      <button :disabled="busy || disabled" @click="edit()">Adicionar caso externo</button>
      <ul>
        <li v-for="test in details.cases" :key="test.id">
          <strong>{{ externalTestCaseName(test.content) }}</strong> ·
          {{ test.required ? "Obrigatório" : "Opcional" }}
          <button class="secondary" :disabled="busy || disabled" @click="edit(test)">
            Editar caso {{ externalTestCaseName(test.content) }}
          </button>
        </li>
      </ul>
      <ExternalTestCaseForm
        v-if="editing && details"
        v-model:name="name"
        v-model:required="required"
        v-model:input="input"
        v-model:expected="expected"
        v-model:remove-confirmed="removeConfirmed"
        :contract="details.contract"
        :case-id="caseId"
        :dirty="dirty"
        :disabled="busy || disabled"
        @submit="save()"
        @close="close"
        @remove="save(true)"
      />
      <ExternalTestReports
        :details="details"
        :base="base"
        :disabled="busy || disabled"
        @more="more"
      />
    </section>
  </section>
</template>
