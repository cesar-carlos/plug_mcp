<script setup lang="ts">
import type { KnowledgeSelection, ProfilePage } from "./knowledge-model";
import type { Source, Training } from "./model";
import { usePublishedKnowledgePicker } from "./use-published-knowledge-picker";

const props = defineProps<{
  source: Source;
  sourceBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  initial?: Training["sharedKnowledge"];
  beforeChange: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  selection: [value: KnowledgeSelection | undefined];
  profiles: [value: ProfilePage];
  curator: [value: boolean];
  touched: [];
}>();
const {
  catalogs,
  catalogId,
  standards,
  standardId,
  profileId,
  profiles,
  busy,
  error,
  errorSummary,
  savedProfileMissing,
  choose,
  refresh,
  reloadProfiles,
  moreDrafts,
  loadMorePublications,
} = usePublishedKnowledgePicker(props, emit);
defineExpose({ refresh, reloadProfiles, moreDrafts });
</script>
<template>
  <section aria-label="Selecionar conhecimento publicado">
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <fieldset :disabled="disabled || busy">
      <legend>Versões publicadas</legend>
      <label
        >Catálogo autorizado<select :value="catalogId" @change="choose($event, 'catalog')">
          <option value="">Selecione um catálogo</option>
          <option v-for="catalog in catalogs" :key="catalog.id" :value="catalog.id">
            {{ catalog.name }}
          </option>
        </select></label
      >
      <label
        >Versão do padrão<select
          :value="standardId"
          :disabled="!catalogId"
          @change="choose($event, 'standard')"
        >
          <option value="">Selecione uma versão publicada</option>
          <option
            v-for="publication in standards"
            :key="publication.id"
            :value="publication.id"
            :disabled="!!publication.suspendedAt"
          >
            {{ publication.content.system }} · {{ publication.content.label }} · revisão
            {{ publication.revision }}{{ publication.suspendedAt ? " (suspensa)" : "" }}
          </option>
        </select></label
      >
      <label
        >Perfil físico publicado<select
          :value="profileId"
          :disabled="!standardId"
          @change="choose($event, 'profile')"
        >
          <option value="">Somente o padrão, sem particularidades</option>
          <option
            v-for="publication in profiles.publications"
            :key="publication.publicationId"
            :value="publication.publicationId"
            :disabled="publication.suspended"
          >
            {{ publication.name }} · revisão {{ publication.revision
            }}{{ publication.suspended ? " (suspenso)" : "" }}
          </option>
        </select></label
      >
      <button
        v-if="profiles.nextPublicationCursor"
        type="button"
        class="secondary"
        @click="loadMorePublications"
      >
        Carregar mais versões de perfil
      </button>
      <button type="button" class="secondary" @click="refresh">
        Atualizar versões disponíveis
      </button>
    </fieldset>
    <p v-if="busy" role="status">Carregando versões autorizadas…</p>
    <p v-else-if="!catalogs.length" class="notice">
      Não há catálogo concedido. O treinamento privado continua disponível.
    </p>
    <p v-if="savedProfileMissing" class="notice">
      A versão física salva não está nesta página ou está indisponível. Carregue mais versões e
      revise antes de alterar o vínculo.
    </p>
  </section>
</template>
