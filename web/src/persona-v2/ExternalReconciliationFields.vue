<script setup lang="ts">
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import ExternalFieldDefinitions from "./ExternalFieldDefinitions.vue";
import ExternalTransportFields from "./ExternalTransportFields.vue";
import ExternalLiteralField from "./ExternalLiteralField.vue";
const contract = defineModel<ExternalContract>({ required: true });
const emit = defineEmits<{ dirty: [key: string, value: boolean] }>();
function enable(event: Event) {
  if ((event.target as HTMLInputElement).checked) {
    contract.value.reconciliationCheck = {
      guarantee: "",
      transport:
        contract.value.transport.kind === "rest"
          ? { kind: "rest", method: "GET", path: "" }
          : { kind: "mcp_http", tool: "", inputSchema: {}, outputSchema: {} },
      input: {},
      output: {},
      bindings: {},
      evidence: {
        countField: "",
        completeField: "",
        statusField: "",
        appliedValue: "",
        correlation: [],
      },
    };
  } else {
    delete contract.value.reconciliationCheck;
    for (const key of ["readInput", "readOutput", "readTransport", "literal"]) {
      emit("dirty", key, false);
    }
  }
}
</script>
<template>
  <fieldset v-if="contract.effect === 'acao'">
    <legend>Conciliação por leitura treinada</legend>
    <label
      ><input :checked="!!contract.reconciliationCheck" type="checkbox" @change="enable" />Incluir
      verificação por chave original e estado terminal</label
    >
    <p>
      Somente leitura do mesmo conector. Evidência positiva não altera comprovante nem permite
      reenvio. Sem esta leitura, a conciliação permanece manual.
    </p>
    <template v-if="contract.reconciliationCheck">
      <label
        >Garantia revisada do serviço<textarea
          v-model="contract.reconciliationCheck.guarantee"
          required
          maxlength="5000"
        />
      </label>
      <ExternalFieldDefinitions
        v-model="contract.reconciliationCheck.input"
        label="Entrada da conciliação"
        @dirty="emit('dirty', 'readInput', $event)"
      />
      <ExternalFieldDefinitions
        v-model="contract.reconciliationCheck.output"
        label="Saída da conciliação"
        @dirty="emit('dirty', 'readOutput', $event)"
      />
      <ExternalTransportFields
        v-model="contract.reconciliationCheck.transport"
        :input="contract.reconciliationCheck.input"
        :output="contract.reconciliationCheck.output"
        label="Transporte da conciliação"
        read-only
        @dirty="emit('dirty', 'readTransport', $event)"
      />
      <label v-for="(field, key) in contract.reconciliationCheck.input" :key="key"
        >Origem de {{ key
        }}<select
          :value="contract.reconciliationCheck.bindings[key] ?? ''"
          required
          @change="
            contract.reconciliationCheck.bindings[key] = ($event.target as HTMLSelectElement).value
          "
        >
          <option value="">Selecione entrada original obrigatória</option>
          <option
            v-for="name in [
              ...new Set([
                ...Object.keys(contract.input).filter(
                  (name) =>
                    contract.input[name]!.required && contract.input[name]!.type === field.type,
                ),
                ...(contract.reconciliationCheck.bindings[key]
                  ? [contract.reconciliationCheck.bindings[key]!]
                  : []),
              ]),
            ]"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select></label
      >
      <div
        v-for="key in Object.keys(contract.reconciliationCheck.bindings).filter(
          (key) => !Object.hasOwn(contract.reconciliationCheck!.input, key),
        )"
        :key="key"
      >
        <p>Vínculo sem campo: {{ key }}</p>
        <button type="button" @click="delete contract.reconciliationCheck!.bindings[key]">
          Remover vínculo {{ key }}
        </button>
      </div>
      <label
        >Campo de contagem<select
          v-model="contract.reconciliationCheck.evidence.countField"
          required
        >
          <option value="">Selecione</option>
          <option
            v-for="(field, key) in contract.reconciliationCheck.output"
            :key="key"
            :value="key"
          >
            {{ key }} · {{ field.type }}
          </option>
        </select></label
      >
      <label
        >Campo de completude<select
          v-model="contract.reconciliationCheck.evidence.completeField"
          required
        >
          <option value="">Selecione</option>
          <option
            v-for="(field, key) in contract.reconciliationCheck.output"
            :key="key"
            :value="key"
          >
            {{ key }} · {{ field.type }}
          </option>
        </select></label
      >
      <label
        >Campo de estado terminal<select
          v-model="contract.reconciliationCheck.evidence.statusField"
          required
        >
          <option value="">Selecione</option>
          <option
            v-for="(field, key) in contract.reconciliationCheck.output"
            :key="key"
            :value="key"
          >
            {{ key }} · {{ field.type }}
          </option>
        </select></label
      >
      <ExternalLiteralField
        v-model="contract.reconciliationCheck.evidence.appliedValue"
        @dirty="emit('dirty', 'literal', $event)"
      />
      <fieldset v-for="(pair, i) in contract.reconciliationCheck.evidence.correlation" :key="i">
        <legend>Correlação {{ i + 1 }}</legend>
        <label
          >Chave da entrada original<select v-model="pair.inputField" required>
            <option value="">Selecione</option>
            <option v-for="(_, key) in contract.input" :key="key" :value="key">{{ key }}</option>
          </select></label
        ><label
          >Chave no resultado da leitura<select v-model="pair.outputField" required>
            <option value="">Selecione</option>
            <option v-for="(_, key) in contract.reconciliationCheck.output" :key="key" :value="key">
              {{ key }}
            </option>
          </select></label
        ><button
          type="button"
          @click="contract.reconciliationCheck!.evidence.correlation.splice(i, 1)"
        >
          Remover correlação {{ i + 1 }}
        </button>
      </fieldset>
      <button
        type="button"
        :disabled="contract.reconciliationCheck.evidence.correlation.length >= 64"
        @click="
          contract.reconciliationCheck.evidence.correlation.push({
            inputField: '',
            outputField: '',
          })
        "
      >
        Adicionar correlação de chave
      </button>
    </template>
  </fieldset>
</template>
