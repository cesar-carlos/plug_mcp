<script lang="ts">
export default { name: "AnotacaoForm" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import type {
  AnotacaoAtualizarPayload,
  AnotacaoCriarPayload,
  AnotacaoGovernanca,
} from "../form-payloads";
import ConfirmField from "./ConfirmField.vue";

const tipo = ref("regra");
const titulo = ref("");
const texto = ref("");
const tabela = ref("");
const vigenteDe = ref("");
const vigenteAte = ref("");
const revisarEm = ref("");
const anotacaoId = ref("");
const confirmado = ref(false);

const emit = defineEmits<{
  criar: [payload: AnotacaoCriarPayload];
  atualizar: [payload: AnotacaoAtualizarPayload];
}>();

const governanca = (): AnotacaoGovernanca => ({
  ...(vigenteDe.value ? { vigenteDe: vigenteDe.value } : {}),
  ...(vigenteAte.value ? { vigenteAte: vigenteAte.value } : {}),
  ...(revisarEm.value ? { revisarEm: revisarEm.value } : {}),
});

const criar = (): void => {
  emit("criar", {
    tipo: tipo.value,
    titulo: titulo.value,
    texto: texto.value,
    tabela: tabela.value || undefined,
    governanca: governanca(),
  });
};

const atualizar = (): void => {
  emit("atualizar", {
    tipo: tipo.value,
    titulo: titulo.value,
    texto: texto.value,
    governanca: governanca(),
    confirmadoPeloUsuario: confirmado.value,
    anotacaoId: anotacaoId.value,
  });
};
</script>

<template>
  <div>
    <form class="card" @submit.prevent="criar">
      <h2>Nova nota</h2>
      <label>
        Tipo
        <select v-model="tipo">
          <option>regra</option>
          <option>metrica</option>
          <option>glossario</option>
          <option>uso</option>
        </select>
      </label>
      <label>Título <input v-model="titulo" required /></label>
      <label>Texto <textarea v-model="texto" rows="4" required /></label>
      <label>Tabela <input v-model="tabela" /></label>
      <label>Vigente de <input v-model="vigenteDe" type="date" /></label>
      <label>Vigente até <input v-model="vigenteAte" type="date" /></label>
      <label>Revisar em <input v-model="revisarEm" type="date" /></label>
      <button type="submit">Gravar</button>
    </form>
    <form class="card" @submit.prevent="atualizar">
      <h2>Atualizar</h2>
      <label>ID <input v-model="anotacaoId" required /></label>
      <ConfirmField v-model="confirmado" />
      <button type="submit">Atualizar</button>
    </form>
  </div>
</template>
