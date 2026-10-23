<script setup lang="ts">
import type { Preview } from "./model";
import type { PublicationPreviewResult } from "../../../src/domain/persona-v2/catalog";
defineProps<{
  preview: Pick<Preview, "review" | "revision"> & {
    diff: Pick<PublicationPreviewResult["diff"], "addedCapabilities" | "removedCapabilities">;
  };
}>();
const kinds = { added: "Acrescentado", removed: "Removido", changed: "Alterado" };
</script>
<template>
  <section v-if="preview.review" class="publication-review" aria-label="Comparação de publicação">
    <p>
      {{
        preview.review.previousRevision === null
          ? "Primeira publicação"
          : `Comparação da revisão ${preview.review.previousRevision} com a revisão ${preview.revision}`
      }}.
    </p>
    <details v-for="section in preview.review.sections" :key="section.id" open>
      <summary>{{ section.label }} · {{ section.changes.length }} alterações</summary>
      <ul>
        <li v-for="change in section.changes" :key="change.path">
          <strong>{{ kinds[change.kind] }}: {{ change.label }}</strong>
          <div v-if="change.kind !== 'added'">
            <span>Anterior</span>
            <pre>{{ JSON.stringify(change.before, null, 2) }}</pre>
          </div>
          <div v-if="change.kind !== 'removed'">
            <span>Proposto</span>
            <pre>{{ JSON.stringify(change.after, null, 2) }}</pre>
          </div>
        </li>
      </ul>
    </details>
    <p>
      Casos: {{ preview.review.cases.total }} · obrigatórios: {{ preview.review.cases.required }} ·
      {{
        preview.review.cases.requiredApproved === true
          ? "relatório obrigatório aprovado e atual"
          : "sem aprovação obrigatória comprovada"
      }}.
    </p>
    <p v-if="!preview.review.cases.required">
      Sem casos obrigatórios. Validade técnica não comprova significado de negócio.
    </p>
    <p>
      Capacidades acrescentadas: {{ preview.diff.addedCapabilities.length }} · removidas:
      {{ preview.diff.removedCapabilities.length }}. Tokens existentes não recebem ampliações
      automaticamente.
    </p>
    <p>
      Publicações dependentes da versão anterior: {{ preview.review.impact.total }}. Usam
      referências exatas; revise e republique as dependentes para adotar a nova versão.
    </p>
    <ul>
      <li v-for="p in preview.review.impact.publications" :key="p.publicationId">
        {{ p.name }} · revisão {{ p.revision }} ·
        {{ p.active ? "ativa" : p.suspended ? "suspensa" : "histórica" }}
      </li>
    </ul>
    <p v-if="preview.review.impact.total > preview.review.impact.publications.length">
      Listagem parcial: até 200 publicações. Novas dependências concorrentes também precisam de
      revisão.
    </p>
  </section>
</template>
