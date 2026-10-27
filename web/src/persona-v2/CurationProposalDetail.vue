<script setup lang="ts">
import KnowledgeContentSummary from "./KnowledgeContentSummary.vue";
import type { Content } from "./knowledge-model";
import {
  curationChangeLabels,
  curationChangePath,
  curationKindLabels,
  curationOriginLabel,
  curationStateLabels,
  type CurationProposal,
} from "./curation-proposal";

defineProps<{
  selected: CurationProposal;
  mayReview: boolean;
  draftDirty: boolean;
  physical: boolean;
  preview:
    | {
        confirmationHash: string;
        expiresAt: string;
        content: Content;
        patternRevision?: number;
        profileRevision?: number;
        changes: { kind: string; path: string }[];
      }
    | undefined;
  reason: string;
  confirmed: boolean;
}>();
const emit = defineEmits<{
  "update:reason": [value: string];
  "update:confirmed": [value: boolean];
  review: [];
  decide: [action: "incorporar" | "rejeitar"];
}>();
</script>

<template>
  <article aria-label="Proposta selecionada">
    <h4>{{ selected.summary }}</h4>
    <p>
      {{ curationKindLabels[selected.change.kind] }} · {{ curationStateLabels[selected.state] }} ·
      versão {{ selected.version }}
    </p>
    <p>
      Origem: {{ curationOriginLabel(selected.origin) }} ·
      {{ new Date(selected.createdAt).toLocaleString() }}
    </p>
    <p v-if="selected.change.kind === 'regra'">{{ selected.change.value }}</p>
    <template v-else-if="selected.change.kind === 'exemplo_sql'"
      ><p>{{ selected.change.value.purpose }} — {{ selected.change.value.explanation }}</p>
      <details v-for="variant in selected.change.value.variants" :key="variant.dialect">
        <summary>Exemplo proposto · {{ variant.dialect }}</summary>
        <pre>{{ variant.sql }}</pre>
        <ul>
          <li v-for="parameter in variant.parameters" :key="parameter.name">
            {{ parameter.name }} · {{ parameter.type }} · {{ parameter.meaning }}
          </li>
        </ul>
      </details></template
    >
    <template v-else-if="selected.change.kind === 'tabela'"
      ><p>{{ selected.change.value.name }} — {{ selected.change.value.meaning }}</p>
      <ul>
        <li v-for="column in selected.change.value.columns" :key="column.name">
          {{ column.name }} — {{ column.meaning }} · {{ column.logicalType }} ·
          {{ column.classification }}
        </li>
      </ul></template
    >
    <p v-else>
      {{ selected.change.value.meaning }} · {{ selected.change.value.cardinality }} ·
      {{ selected.change.value.keys.map((k) => `${k.from} → ${k.to}`).join(", ") }}
    </p>
    <details>
      <summary>Proveniência da proposta</summary>
      <p>Responsável de origem: {{ selected.ownerId }}</p>
      <p v-if="selected.personaId">
        Persona: {{ selected.personaId }} · fonte: {{ selected.sourceId }} · skill:
        {{ selected.skillId }}
      </p>
      <p class="technical-value">Hash: {{ selected.hash }}</p>
      <p v-if="'profilePublicationId' in selected" class="technical-value">
        Perfil-base: {{ selected.profilePublicationId }} · identidade: {{ selected.identityHash }} ·
        versão da fonte: {{ selected.sourceVersion }} · credencial:
        {{ selected.credentialVersion }}
      </p>
      <p v-if="selected.reviewedAt">
        Revisão: {{ new Date(selected.reviewedAt).toLocaleString() }} · {{ selected.reason }}
      </p>
    </details>
    <template v-if="mayReview && selected.state === 'pending'">
      <p v-if="draftDirty" class="notice">
        Salve ou descarte a edição {{ physical ? "do perfil" : "do padrão" }} antes de revisar uma
        incorporação.
      </p>
      <button type="button" :disabled="draftDirty" @click="emit('review')">
        Revisar incorporação ao rascunho
      </button>
      <section v-if="preview" aria-label="Revisão da incorporação">
        <h4>
          Conteúdo proposto para a revisão
          {{ (preview.profileRevision ?? preview.patternRevision ?? 0) + 1 }}
        </h4>
        <p>
          Válido até {{ new Date(preview.expiresAt).toLocaleTimeString() }}. Exemplos novos
          permanecem candidatos.
        </p>
        <ul>
          <li v-for="change in preview.changes" :key="change.path">
            {{ curationChangeLabels[change.kind] ?? change.kind }}:
            {{ curationChangePath(change.path) }}
          </li>
        </ul>
        <KnowledgeContentSummary
          :content="preview.content"
          :dialect="preview.content.dialects[0]!"
          :draft="true"
        />
      </section>
      <label
        >Justificativa da decisão<textarea
          :value="reason"
          maxlength="2000"
          required
          @input="emit('update:reason', ($event.target as HTMLTextAreaElement).value)"
        /></label
      ><label class="check"
        ><input
          :checked="confirmed"
          type="checkbox"
          :disabled="draftDirty"
          @change="emit('update:confirmed', ($event.target as HTMLInputElement).checked)"
        />Revisei a proposta e os efeitos desta decisão sobre o rascunho.</label
      >
      <button
        type="button"
        :disabled="!preview || !confirmed || !reason.trim() || draftDirty"
        @click="emit('decide', 'incorporar')"
      >
        Incorporar proposta ao rascunho</button
      ><button
        type="button"
        class="danger"
        :disabled="!confirmed || !reason.trim() || draftDirty"
        @click="emit('decide', 'rejeitar')"
      >
        Rejeitar proposta
      </button>
    </template>
  </article>
</template>
