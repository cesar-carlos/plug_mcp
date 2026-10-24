<script setup lang="ts">
import { ref, watch } from "vue";
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import type { IntegrationReference } from "../../../src/domain/persona-v2/integration-credential";
import ExternalFieldDefinitions from "./ExternalFieldDefinitions.vue";
import ExternalTransportFields from "./ExternalTransportFields.vue";
import ExternalReconciliationFields from "./ExternalReconciliationFields.vue";
const contract = defineModel<ExternalContract>({ required: true });
const props = defineProps<{
  connections: readonly (IntegrationReference & { active: boolean })[];
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [key: string, value: boolean] }>();
const nextKind = ref(contract.value.transport.kind),
  replace = ref(false);
watch(
  () => contract.value.transport.kind,
  (kind) => {
    nextKind.value = kind;
    replace.value = false;
  },
);
function transportChange() {
  if (!replace.value) {
    return;
  }
  contract.value.transport =
    nextKind.value === "rest"
      ? { kind: "rest", method: contract.value.effect === "consulta" ? "GET" : "POST", path: "" }
      : { kind: "mcp_http", tool: "", inputSchema: {}, outputSchema: {} };
  replace.value = false;
  emit("dirty", "transport", false);
  emit("dirty", "transportChoice", false);
}
async function effectChange(event: Event) {
  const element = event.target as HTMLSelectElement,
    next = element.value as ExternalContract["effect"];
  element.value = contract.value.effect;
  if (next === contract.value.effect) {
    return;
  }
  if (
    contract.value.effect === "acao" &&
    (contract.value.effectDescription ||
      contract.value.reconciliation ||
      contract.value.reconciliationCheck) &&
    !(await props.confirmDiscard())
  ) {
    return;
  }
  contract.value.effect = next;
  if (next === "consulta") {
    delete contract.value.approval;
    delete contract.value.effectDescription;
    delete contract.value.reconciliation;
    delete contract.value.reconciliationCheck;
    for (const key of ["readInput", "readOutput", "readTransport", "literal"]) {
      emit("dirty", key, false);
    }
  } else {
    contract.value.approval = "human";
    contract.value.effectDescription = "";
    contract.value.reconciliation = "";
  }
}
</script>
<template>
  <label
    >Integração da skill<select v-model="contract.integrationId" required>
      <option value="">Selecione conexão cadastrada no navegador</option>
      <option
        v-if="contract.integrationId && !connections.some((c) => c.id === contract.integrationId)"
        :value="contract.integrationId"
      >
        Integração indisponível · corrija explicitamente
      </option>
      <option v-for="connection in connections" :key="connection.id" :value="connection.id">
        {{ connection.name }} · {{ connection.kind }} · credencial v{{ connection.version }}
      </option>
    </select></label
  >
  <p v-if="connections.find((c) => c.id === contract.integrationId)">
    Destino: {{ connections.find((c) => c.id === contract.integrationId)!.destination }}. Cadastro e
    credencial não concedem execução; a publicação fixa este destino e versão.
  </p>
  <p
    v-if="
      contract.integrationId &&
      connections.find((c) => c.id === contract.integrationId)?.kind !== contract.transport.kind
    "
  >
    O transporte deve corresponder ao conector selecionado. Escolher outra conexão não reescreve o
    contrato.
  </p>
  <label
    >Finalidade da skill externa<textarea v-model="contract.purpose" required maxlength="5000" />
  </label>
  <label
    >Efeito da skill externa<select :value="contract.effect" @change="effectChange">
      <option value="acao">Ação com efeitos</option>
      <option value="consulta">Consulta externa</option>
    </select></label
  >
  <template v-if="contract.effect === 'acao'"
    ><label
      >Descrição dos efeitos<textarea
        v-model="contract.effectDescription"
        required
        maxlength="5000"
      /></label
    ><label
      >Aprovação exigida pela skill<select v-model="contract.approval">
        <option value="human">Responsável autenticado</option>
        <option value="automatic">Automática, se o token permitir</option>
      </select></label
    >
    <p>Publicar não aprova lançamentos. Token e consentimento podem exigir aprovação adicional.</p>
    <label
      >Procedimento de conciliação<textarea
        v-model="contract.reconciliation"
        required
        maxlength="5000"
      /></label
  ></template>
  <fieldset>
    <legend>Escolha explícita do transporte</legend>
    <label
      >Novo transporte<select
        v-model="nextKind"
        @change="emit('dirty', 'transportChoice', nextKind !== contract.transport.kind)"
      >
        <option value="rest">REST HTTPS</option>
        <option value="mcp_http">MCP remoto Streamable HTTP</option>
      </select></label
    ><label
      ><input
        v-model="replace"
        type="checkbox"
        @change="emit('dirty', 'transportChoice', replace || nextKind !== contract.transport.kind)"
      />Confirmo substituir rota/ferramenta e schemas do transporte local.</label
    ><button type="button" :disabled="!replace" @click="transportChange">
      Aplicar escolha de transporte
    </button>
  </fieldset>
  <ExternalFieldDefinitions
    v-model="contract.input"
    label="Entrada da operação"
    @dirty="emit('dirty', 'input', $event)"
  />
  <ExternalFieldDefinitions
    v-model="contract.output"
    label="Saída da operação"
    @dirty="emit('dirty', 'output', $event)"
  />
  <ExternalTransportFields
    v-model="contract.transport"
    :input="contract.input"
    :output="contract.output"
    label="Contrato do transporte"
    @dirty="emit('dirty', 'transport', $event)"
  />
  <ExternalReconciliationFields
    v-model="contract"
    @dirty="(key, value) => emit('dirty', key, value)"
  />
  <label
    >Prazo da chamada externa (ms)<input
      v-model.number="contract.timeoutMs"
      required
      type="number"
      min="1"
      max="30000" /></label
  ><label
    >Resposta máxima externa (bytes)<input
      v-model.number="contract.maxResponseBytes"
      required
      type="number"
      min="1"
      max="1048576"
  /></label>
</template>
