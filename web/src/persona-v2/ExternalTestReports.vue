<script setup lang="ts">
import type { ExternalTestDetails } from "../../../src/domain/persona-v2/external-run";
import {
  externalOperatorLink,
  externalReportApprovalLabel,
  externalReportCurrencyLabel,
  externalReportRunLabel,
} from "./external-tests";

const props = defineProps<{
  details: ExternalTestDetails;
  base: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ more: [] }>();
</script>
<template>
  <h4>Relatórios técnicos</h4>
  <p v-if="!details.reports.length">
    Nenhuma rodada registrada. Ausência de relatório não prova ausência de testes antigos.
  </p>
  <ul>
    <li v-for="report in details.reports" :key="report.id">
      <strong>{{ externalReportCurrencyLabel(report.current) }}</strong>
      · {{ externalReportApprovalLabel(report.approved) }} ·
      {{ new Date(report.createdAt).toLocaleString() }}
      <p v-if="report.runState === 'unknown'">
        Rodada incerta. Não repita efeitos; solicite investigação ao operador.
      </p>
      <p v-if="report.runState === 'running'">
        Rodada ainda em execução ou interrompida. Não inicie outra no mesmo destino.
      </p>
      <p>
        Revisão {{ report.revision }} ·
        {{ report.results.filter((result) => result.passed).length }} de
        {{ report.results.length }} casos aprovados
      </p>
      <details>
        <summary>Casos e identificação da rodada</summary>
        <p v-for="result in report.results" :key="result.id">
          Caso {{ result.id }}: {{ result.passed ? "passou" : "falhou" }}
        </p>
        <p>Runner {{ report.runnerId }} · rodada {{ externalReportRunLabel(report.runId) }}</p>
        <p>Hash {{ report.packageHash }}</p>
      </details>
    </li>
  </ul>
  <button v-if="details.nextCursor" class="secondary" :disabled="disabled" @click="emit('more')">
    Carregar mais relatórios
  </button>
  <details>
    <summary>Vínculo técnico para o operador</summary>
    <p>
      O manifesto fixa estes valores e uma integração de fixture separada. Nenhuma credencial deve
      ser incluída.
    </p>
    <pre>{{ JSON.stringify(externalOperatorLink(props.base, details), null, 2) }}</pre>
  </details>
</template>
