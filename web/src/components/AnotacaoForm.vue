<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AnotacaoItem } from "../api";
import type {
  AnotacaoAtualizarPayload,
  AnotacaoCriarPayload,
  AnotacaoGovernanca,
} from "../form-payloads";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { governancaPayload, type GovernancaForm } from "../governanca";
import ConfirmField from "./ConfirmField.vue";
const props = defineProps<{
  anotacao?: AnotacaoItem | null;
  pending?: boolean;
  revision?: number;
}>();
const emit = defineEmits<{
  criar: [payload: AnotacaoCriarPayload];
  atualizar: [payload: AnotacaoAtualizarPayload];
  cancelar: [];
}>();
const tipo = ref("regra");
const titulo = ref("");
const texto = ref("");
const tabela = ref("");
const confirmado = ref(false);
const datas = ref<GovernancaForm>({
  vigenteDe: "",
  vigenteAte: "",
  revisarEm: "",
  fonteTipo: "usuario",
  fonteReferencia: "",
  responsavel: "",
  status: "vigente",
  periodoRevisaoDias: "",
});
const original = ref("");
const originalGovernanca = ref<GovernancaForm>({ ...datas.value });
const snapshot = (): string =>
  JSON.stringify({
    tipo: tipo.value,
    titulo: titulo.value,
    texto: texto.value,
    tabela: tabela.value,
    datas: datas.value,
  });
watch(
  () => [props.anotacao, props.revision],
  () => {
    const item = props.anotacao;
    tipo.value = item?.tipo ?? "regra";
    titulo.value = item?.titulo ?? "";
    texto.value = item?.texto ?? "";
    tabela.value = "";
    confirmado.value = false;
    datas.value = {
      vigenteDe: item?.vigenteDe ?? "",
      vigenteAte: item?.vigenteAte ?? "",
      revisarEm: item?.revisarEm ?? "",
      fonteTipo: item?.fonteTipo ?? "usuario",
      fonteReferencia: item?.fonteReferencia ?? "",
      responsavel: item?.responsavel ?? "",
      status: item?.status ?? "vigente",
      periodoRevisaoDias: item?.periodoRevisaoDias == null ? "" : String(item.periodoRevisaoDias),
    };
    original.value = snapshot();
    originalGovernanca.value = { ...datas.value };
  },
  { immediate: true },
);
const dirty = computed(() => snapshot() !== original.value);
defineExpose({ dirty });
useUnsavedChanges(dirty);
const governanca = (): AnotacaoGovernanca => {
  return governancaPayload(datas.value, originalGovernanca.value, Boolean(props.anotacao));
};
const save = (): void => {
  if (props.anotacao) {
    if (!confirmado.value) {
      return;
    }
    emit("atualizar", {
      tipo: tipo.value,
      titulo: titulo.value,
      texto: texto.value,
      governanca: governanca(),
      confirmadoPeloUsuario: confirmado.value,
      anotacaoId: props.anotacao.id,
    });
  } else {
    emit("criar", {
      tipo: tipo.value,
      titulo: titulo.value,
      texto: texto.value,
      tabela: tabela.value || undefined,
      governanca: governanca(),
    });
  }
};
</script>
<template>
  <form class="card" @submit.prevent="save">
    <h2>{{ anotacao ? "Editar anotação" : "Nova anotação" }}</h2>
    <label
      >Tipo<select v-model="tipo">
        <option value="regra">Regra</option>
        <option value="metrica">Métrica</option>
        <option value="glossario">Glossário</option>
        <option value="uso">Uso</option>
      </select></label
    >
    <label>Título<input v-model="titulo" required /></label
    ><label>Texto<textarea v-model="texto" rows="4" required /></label
    ><label v-if="!anotacao">Tabela<input v-model="tabela" placeholder="Opcional" /></label>
    <fieldset class="section">
      <legend>Vigência e revisão</legend>
      <div class="fields-2">
        <label>Vigente de<input v-model="datas.vigenteDe" type="date" /></label
        ><label
          >Vigente até<input v-model="datas.vigenteAte" type="date" :min="datas.vigenteDe" /></label
        ><label>Revisar em<input v-model="datas.revisarEm" type="date" /></label
        ><label
          >Cadência de revisão (dias)<input
            v-model="datas.periodoRevisaoDias"
            type="number"
            min="1"
            max="3650"
        /></label>
      </div>
      <label
        >Status<select v-model="datas.status">
          <option value="vigente">Vigente</option>
          <option value="obsoleta">Obsoleta</option>
        </select></label
      >
    </fieldset>
    <details class="raw">
      <summary>Origem e responsabilidade</summary>
      <label
        >Fonte<select v-model="datas.fonteTipo">
          <option
            v-for="fonte in ['usuario', 'erp', 'documento', 'importacao', 'legado', 'outro']"
            :key="fonte"
          >
            {{ fonte }}
          </option>
        </select></label
      ><label>Referência<input v-model="datas.fonteReferencia" maxlength="300" /></label
      ><label>Responsável<input v-model="datas.responsavel" maxlength="300" /></label>
    </details>
    <ConfirmField v-if="anotacao" v-model="confirmado" label="Confirmo atualizar esta anotação" />
    <div class="form-actions">
      <button type="submit" :disabled="pending || !dirty || (Boolean(anotacao) && !confirmado)">
        Salvar anotação</button
      ><button class="secondary" type="button" @click="emit('cancelar')">
        {{ anotacao ? "Cancelar edição" : "Limpar formulário" }}
      </button>
    </div>
  </form>
</template>
