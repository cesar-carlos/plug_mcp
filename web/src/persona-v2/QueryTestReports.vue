<script setup lang="ts">
import type { OperationTestDetails } from "../../../src/domain/persona-v2/catalog";
import {
  queryTestCaseName,
  queryTestReportCaseLabel,
  queryTestsApprovalLabel,
} from "./query-tests";

defineProps<{
  details: OperationTestDetails;
  disabled: boolean;
}>();
const emit = defineEmits<{ more: [] }>();
</script>
<template>
  <p>Revisão {{ details.revision }} · {{ queryTestsApprovalLabel(details.requiredApproved) }}</p>
  <p v-if="!details.cases.length">Nenhum caso cadastrado nesta revisão.</p>
  <ul>
    <li v-for="test in details.cases" :key="test.id">
      {{ queryTestCaseName(test.content) }} · {{ test.required ? "obrigatório" : "opcional" }}
    </li>
  </ul>
  <p v-if="!details.reports.length">
    Nenhum relatório registrado. Isso não comprova ausência de testes.
  </p>
  <ul>
    <li v-for="report in details.reports" :key="report.id">
      {{ report.runnerId }} · revisão {{ report.revision }} ·
      {{ new Date(report.createdAt).toLocaleString() }} ·
      {{ report.approved ? "aprovado tecnicamente" : "reprovado" }} ·
      {{ report.current ? "conteúdo atual" : "conteúdo diferente ou não comprovado" }}
      <details>
        <summary>Resultados por caso</summary>
        <ul>
          <li v-for="item in report.results" :key="item.id">
            {{ queryTestReportCaseLabel(details.cases, item.id) }}:
            {{ item.passed ? "passou" : "falhou" }}
          </li>
        </ul>
      </details>
    </li>
  </ul>
  <p v-if="details.nextCursor">Lista de relatórios parcial.</p>
  <button v-if="details.nextCursor" type="button" :disabled="disabled" @click="emit('more')">
    Mais relatórios da consulta
  </button>
</template>
