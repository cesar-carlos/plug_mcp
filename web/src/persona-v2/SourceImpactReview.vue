<script setup lang="ts">
import type { Source } from "./model";
import type { SourcePublicationImpact } from "../../../src/domain/persona-v2/model";
import type { SourceSettingsAction } from "./source-settings";

defineProps<{
  impact: SourcePublicationImpact;
  pending: SourceSettingsAction;
  source: Source;
  busy: boolean;
}>();
const confirmed = defineModel<boolean>("confirmed", { required: true });
const emit = defineEmits<{ confirm: []; continue: [] }>();
</script>

<template>
  <section :aria-labelledby="`source-impact-${source.id}`">
    <h3 :id="`source-impact-${source.id}`" tabindex="-1">Revisar impacto em {{ source.name }}</h3>
    <p v-if="!impact.total">Nenhuma publicação depende desta base neste momento.</p>
    <p v-else>
      {{ impact.total }} publicação(ões) afetada(s), incluindo dependências transitivas e versões
      anteriores.
    </p>
    <ul>
      <li v-for="p in impact.publications" :key="p.publicationId">
        {{ p.name }} · revisão {{ p.revision }} · {{ p.kind }} ·
        {{ p.direct ? "Usa esta base" : "Dependência transitiva" }} ·
        {{ p.suspended ? "Já suspensa" : p.active ? "Será suspensa" : "Versão anterior" }}
      </li>
    </ul>
    <p v-if="impact.total > impact.publications.length" class="notice">
      Mostrando {{ impact.publications.length }} de {{ impact.total }} publicações. A alteração
      suspende todas as afetadas.
    </p>
    <p>
      Esta revisão reflete o estado atual. Novas publicações dependentes também serão suspensas ao
      salvar. Revise, teste e publique novamente antes de consultar.
    </p>
    <label
      ><input v-model="confirmed" type="checkbox" :disabled="busy" />Entendi o impacto desta
      alteração</label
    >
    <button type="button" :disabled="busy || !confirmed" @click="emit('confirm')">
      {{ pending === "rotate" ? "Confirmar troca de credenciais" : "Confirmar alteração da base" }}
    </button>
    <button type="button" class="secondary" :disabled="busy" @click="emit('continue')">
      Continuar editando
    </button>
  </section>
</template>
