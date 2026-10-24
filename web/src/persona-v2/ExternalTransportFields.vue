<script setup lang="ts">
import { ref } from "vue";
import { z } from "zod";
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import { proposedRemoteSchema } from "./external-editor";
const transport = defineModel<ExternalContract["transport"]>({ required: true });
const props = defineProps<{
  input: ExternalContract["input"];
  output: ExternalContract["output"];
  label: string;
  readOnly?: boolean;
}>();
const emit = defineEmits<{ dirty: [boolean] }>();
const editing = ref(false),
  inputJson = ref(""),
  outputJson = ref(""),
  replaceConfirmed = ref(false),
  error = ref("");
function editSchemas() {
  if (transport.value.kind !== "mcp_http") {
    return;
  }
  inputJson.value = JSON.stringify(transport.value.inputSchema, null, 2);
  outputJson.value = JSON.stringify(transport.value.outputSchema, null, 2);
  editing.value = true;
  emit("dirty", true);
}
function applySchemas() {
  if (transport.value.kind !== "mcp_http") {
    return;
  }
  try {
    const input = z.json().parse(JSON.parse(inputJson.value)),
      output = z.json().parse(JSON.parse(outputJson.value));
    transport.value = { ...transport.value, inputSchema: input, outputSchema: output };
    editing.value = false;
    error.value = "";
    emit("dirty", false);
  } catch {
    error.value = "Schemas JSON inválidos; mantenha a edição para corrigir.";
  }
}
function generate() {
  if (transport.value.kind !== "mcp_http" || !replaceConfirmed.value) {
    return;
  }
  transport.value = {
    ...transport.value,
    inputSchema: proposedRemoteSchema(props.input),
    outputSchema: proposedRemoteSchema(props.output),
  };
  replaceConfirmed.value = false;
  editing.value = false;
  emit("dirty", false);
}
</script>
<template>
  <fieldset>
    <legend>{{ label }}</legend>
    <template v-if="transport.kind === 'rest'"
      ><label
        >Método REST<select v-model="transport.method" :disabled="readOnly">
          <option value="GET">GET · leitura</option>
          <template v-if="!readOnly"
            ><option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option></template
          >
        </select></label
      ><label
        >Rota fixa REST<input
          v-model="transport.path"
          required
          maxlength="1000"
          pattern="/[A-Za-z0-9/_\-]*"
          placeholder="/pedidos" /></label
    ></template>
    <template v-else
      ><label
        >Ferramenta MCP remota<input
          v-model="transport.tool"
          required
          maxlength="128"
          pattern="[A-Za-z0-9_.\-]+"
      /></label>
      <p>
        Os schemas publicados devem corresponder exatamente ao serviço remoto. Gerar uma proposta
        local não descobre nem comprova o contrato do servidor.
      </p>
      <details>
        <summary>Schemas MCP fixados</summary>
        <pre>{{
          JSON.stringify({ input: transport.inputSchema, output: transport.outputSchema }, null, 2)
        }}</pre>
      </details>
      <label
        ><input
          v-model="replaceConfirmed"
          type="checkbox"
          @change="emit('dirty', replaceConfirmed || editing)"
        />Confirmo substituir os schemas por uma proposta plana dos campos declarados.</label
      ><button type="button" :disabled="!replaceConfirmed" @click="generate">
        Gerar proposta dos schemas MCP
      </button>
      <button type="button" @click="editSchemas">Editar schemas MCP JSON</button>
      <div v-if="editing">
        <label>Schema de entrada MCP<textarea v-model="inputJson" /></label
        ><label>Schema de saída MCP<textarea v-model="outputJson" /></label>
        <p v-if="error" role="alert">{{ error }}</p>
        <button type="button" @click="applySchemas">Aplicar schemas MCP</button
        ><button
          type="button"
          @click="
            editing = false;
            emit('dirty', false);
          "
        >
          Descartar edição dos schemas
        </button>
      </div>
    </template>
  </fieldset>
</template>
