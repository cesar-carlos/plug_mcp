<script setup lang="ts">
import {
  issueLabels,
  type Comparison,
  type Content,
  type Inspection,
  type KnowledgeSelection,
} from "./knowledge-model";
import {
  sourceKnowledgeCompareDisabled,
  sourceKnowledgeCompatibilitySubject,
  sourceKnowledgeResourceLabel,
  sourceKnowledgeStatusLabel,
} from "./source-knowledge";

defineProps<{
  selection: KnowledgeSelection;
  inspection?: Inspection;
  comparison?: Comparison;
  content?: Content;
  disabled: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  compare: [];
}>();
</script>

<template>
  <section aria-label="Compatibilidade do conhecimento">
    <h3>Conferir compatibilidade</h3>
    <p>
      Compara fatos técnicos com {{ sourceKnowledgeCompatibilitySubject(selection) }}.
      Compatibilidade não concede execução nem substitui revisão de negócio.
    </p>
    <button
      type="button"
      :disabled="
        sourceKnowledgeCompareDisabled({
          disabled,
          busy,
          hasInspection: !!inspection,
          profileSuspended: !!selection.profile?.suspended,
          standardSuspended: !!selection.standard.suspendedAt,
        })
      "
      @click="emit('compare')"
    >
      Verificar compatibilidade
    </button>
    <template v-if="comparison">
      <h4 aria-live="polite">
        {{ sourceKnowledgeStatusLabel[comparison.status] }}
      </h4>
      <p v-if="comparison.status === 'compatible'">
        As dependências selecionadas foram comprovadas. Ainda é necessário salvar, testar, publicar
        e conceder a skill.
      </p>
      <ul v-else>
        <li v-for="(issue, index) in comparison.issues" :key="index">
          <strong
            >{{ sourceKnowledgeResourceLabel(content, issue.resource)
            }}{{ issue.field ? ` · ${issue.field}` : "" }}</strong
          >:
          {{
            issueLabels[issue.code] ??
            "Dependência sem comprovação. Revise a versão publicada e a evidência."
          }}
        </li>
      </ul>
    </template>
    <p v-if="!inspection" class="notice">
      Inspecione o escopo para obter uma evidência vigente antes de comparar.
    </p>
  </section>
</template>
