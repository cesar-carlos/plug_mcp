<script setup lang="ts">
import type { CatalogTestReport, TrainingCase } from "../../../src/domain/persona-v2/catalog";
import { skillReportCaseLabel } from "./skill-editor";

const props = defineProps<{
  heading: string;
  approvedLabel: string;
  missingLabel: string;
  emptyLabel: string;
  resultsSummary: string;
  moreLabel: string;
  reports: readonly (CatalogTestReport & { current: boolean })[];
  requiredApproved: boolean;
  nextCursor: string | null;
  cases?: readonly TrainingCase[];
  moreDisabled: boolean;
}>();
const emit = defineEmits<{ more: [] }>();
function resultLabel(resultId: string): string {
  return props.cases ? skillReportCaseLabel(props.cases, resultId) : resultId;
}
</script>
<template>
  <h3>{{ heading }}</h3>
  <p>{{ requiredApproved ? approvedLabel : missingLabel }}</p>
  <p v-if="!reports.length">{{ emptyLabel }}</p>
  <ul>
    <li v-for="report in reports" :key="report.id">
      {{ report.runnerId }} · revisão {{ report.revision }} ·
      {{ new Date(report.createdAt).toLocaleString() }} ·
      {{ report.approved ? "aprovado tecnicamente" : "reprovado" }} ·
      {{ report.current ? "conteúdo atual" : "conteúdo diferente ou não comprovado" }}
      <details>
        <summary>{{ resultsSummary }}</summary>
        <ul>
          <li v-for="result in report.results" :key="result.id">
            {{ resultLabel(result.id) }}: {{ result.passed ? "passou" : "falhou" }}
          </li>
        </ul>
        <p>Pacote: {{ report.packageHash }}</p>
        <p>Casos: {{ report.casesHash }}</p>
      </details>
    </li>
  </ul>
  <button v-if="nextCursor" :disabled="moreDisabled" @click="emit('more')">{{ moreLabel }}</button>
</template>
