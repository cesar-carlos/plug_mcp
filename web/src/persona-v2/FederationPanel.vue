<script setup lang="ts">
import type { Source } from "./model";
import FederationConsumerInputs from "./FederationConsumerInputs.vue";
import FederationConsumerResult from "./FederationConsumerResult.vue";
import { useFederationPanel } from "./use-federation-panel";

const props = defineProps<{
  personaId: string;
  bearer: string;
  sources: Source[];
  disabled: boolean;
  mcp: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ lock: [value: boolean]; dirty: [value: boolean] }>();
const {
  skills,
  selected,
  context,
  inputs,
  result,
  pageSize,
  validated,
  error,
  errorSummary,
  submitted,
  busy,
  semantics,
  sourceName,
  discover,
  choose,
  execute,
} = useFederationPanel(props, emit);
</script>

<template>
  <section aria-label="Cruzamentos publicados">
    <h3>Cruzar bases</h3>
    <p>
      Use o token informado acima. As combinações, fontes e relacionamentos vêm da publicação;
      adapte somente o SQL autorizado de cada etapa.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" class="error" tabindex="-1">{{ error }}</p>
    <button
      type="button"
      class="secondary"
      :disabled="disabled || busy || !bearer"
      @click="discover"
    >
      Ver cruzamentos permitidos por este token
    </button>
    <p v-if="skills && !skills.length">
      Nenhum cruzamento publicado foi concedido a este token com todas as suas dependências.
    </p>
    <fieldset v-if="skills?.length" :disabled="disabled || busy">
      <label
        >Cruzamento<select :value="selected" @change="choose">
          <option value="">Selecione</option>
          <option v-for="skill in skills" :key="skill.id" :value="skill.id">
            {{ skill.name }}
          </option>
        </select></label
      >
    </fieldset>
    <template v-if="context">
      <p>{{ context.purpose }}</p>
      <dl>
        <template v-for="(label, key) in semantics" :key="key"
          ><dt>{{ label }}</dt>
          <dd>{{ context.training.semantics[key] }}</dd></template
        >
      </dl>
      <details>
        <summary>Combinação publicada e limites</summary>
        <ol>
          <li v-for="step in context.steps" :key="step.id">
            Etapa {{ step.id }} ·
            {{ step.kind === "local" ? `Consulta em ${sourceName(step.sourceId)}` : step.kind }}
            <pre v-if="step.kind !== 'local'">{{ JSON.stringify(step, null, 2) }}</pre>
          </li>
        </ol>
        <p>
          Até {{ context.executionBudget.sources }} bases e
          {{ context.executionBudget.steps }} etapas;
          {{ context.executionBudget.rowsPerSource }} linhas por base;
          {{ context.executionBudget.intermediateRows }} linhas intermediárias;
          {{ context.executionBudget.intermediateBytes }} bytes;
          {{ context.executionBudget.timeoutMs / 1000 }} segundos. Paginação somente após combinar.
        </p>
      </details>
      <FederationConsumerInputs
        v-model:page-size="pageSize"
        :inputs="inputs"
        :source-name="sourceName"
        :disabled="disabled"
        :busy="busy"
        :bearer="bearer"
        @execute="execute($event)"
      />
      <p v-if="validated" class="success" role="status">
        Plano e SQL validados tecnicamente. Isso não aprova o significado do treinamento.
      </p>
    </template>
    <FederationConsumerResult
      v-if="result"
      :result="result"
      :submitted="submitted"
      :context-name="context?.name"
      :source-name="sourceName"
      :disabled="disabled"
      :busy="busy"
      @page="execute(false, $event)"
    />
  </section>
</template>
