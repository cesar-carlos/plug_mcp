<script setup lang="ts">
import { RouterLink } from "vue-router";
import ListSearch from "./ListSearch.vue";
import PublicationReview from "./PublicationReview.vue";
import QueryTrainingForm from "./QueryTrainingForm.vue";
import { queryDraftStatus } from "./console-status";
import { lazyPanel } from "./lazy-panel";
import type { Draft, Preview, Publication, Source, Training } from "./model";

const QueryTestsPanel = lazyPanel(() => import("./QueryTestsPanel.vue"));
const SourceKnowledgeWorkspace = lazyPanel(() => import("./SourceKnowledgeWorkspace.vue"));
const FederationSkillEditor = lazyPanel(() => import("./FederationSkillEditor.vue"));
const ExternalSkillEditor = lazyPanel(() => import("./ExternalSkillEditor.vue"));
const OperationSkillEditor = lazyPanel(() => import("./OperationSkillEditor.vue"));

defineProps<{
  sources: Source[];
  queryDrafts: Draft[];
  matchingDrafts: Draft[];
  publications: Record<string, Publication>;
  invalidField: (field: string) => boolean;
  duplicateExamples: readonly [string, string][];
  dirty: boolean;
  queryCaseDirty: boolean;
  trainingKnowledgeDirty: boolean;
  busy: boolean;
  personaId: string;
  queryTestsKey: number;
  trainingKnowledgeKey: number;
  federationSkillKey: number;
  externalSkillKey: number;
  operationSkillKey: number;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  confirmDiscard: () => Promise<boolean>;
}>();
const skillSearch = defineModel<string>("skillSearch", { required: true });
const draftId = defineModel<string>("draftId", { required: true });
const training = defineModel<Training>("training", { required: true });
const name = defineModel<string>("name", { required: true });
const slug = defineModel<string>("slug", { required: true });
const revision = defineModel<number>("revision", { required: true });
const reviewDate = defineModel<string>("reviewDate", { required: true });
const preview = defineModel<Preview | undefined>("preview", { required: true });
const confirmed = defineModel<boolean>("confirmed", { required: true });
const emit = defineEmits<{
  editDraft: [event: Event];
  reloadTraining: [];
  save: [];
  changeSource: [event: Event];
  preview: [];
  publish: [];
  queryCaseDirty: [value: boolean];
  trainingKnowledgeDirty: [value: boolean];
  federationDirty: [value: boolean];
  externalDirty: [value: boolean];
  operationDirty: [value: boolean];
  lock: [value: boolean];
  changed: [];
  panelMounted: [panel: "operation" | "external" | "federation" | "knowledge" | "cases"];
  revisionSaved: [revision: number];
}>();
</script>
<template>
  <section v-if="sources.length">
    <h2>Treinar consultas</h2>
    <p>
      Origem: treinamento desta persona e fonte, com versões compartilhadas quando adotadas. A base
      técnica comum orienta SQL e API; estrutura e significado de negócio exigem revisão.
    </p>
    <p>
      Organize finalidade e fonte, estrutura, relacionamentos, exemplos, parâmetros, regras e
      testes. O SQL principal permanece o modelo desta skill.
    </p>
    <fieldset :disabled="busy">
      <ListSearch
        v-if="queryDrafts.length"
        v-model="skillSearch"
        label="Buscar skills de consulta"
        :matches="matchingDrafts.length"
        :total="queryDrafts.length"
      />
      <p v-if="!queryDrafts.length && !busy" class="notice">
        Nenhuma consulta treinada. Preencha o novo treinamento abaixo; salvar cria um rascunho, e
        publicar exige uma revisão separada.
      </p>
      <label
        >Editar treinamento<select :value="draftId" @change="emit('editDraft', $event)">
          <option value="">Novo treinamento</option>
          <option
            v-for="d in queryDrafts.filter((d) => d.id === draftId || matchingDrafts.includes(d))"
            :key="d.id"
            :value="d.id"
          >
            {{ d.name }} ·
            {{ queryDraftStatus(d, publications[d.id]) }}
          </option>
        </select></label
      >
      <button type="button" class="secondary" :disabled="!draftId" @click="emit('reloadTraining')">
        Recarregar treinamento
      </button>
      <QueryTrainingForm
        v-model:training="training"
        v-model:name="name"
        v-model:slug="slug"
        :draft-id="draftId"
        :sources="sources"
        :invalid-field="invalidField"
        :duplicate-examples="duplicateExamples"
        :disabled="queryCaseDirty"
        :dirty="dirty"
        @save="emit('save')"
        @change-source="emit('changeSource', $event)"
      />
      <SourceKnowledgeWorkspace
        v-if="training.sourceId"
        :key="`training:${personaId}:${trainingKnowledgeKey}`"
        :sources="sources"
        :persona-base="base"
        :api="api"
        :disabled="busy || queryCaseDirty"
        :confirm-discard="confirmDiscard"
        :training="training"
        @vue:mounted="emit('panelMounted', 'knowledge')"
        @training="training = $event"
        @dirty="emit('trainingKnowledgeDirty', $event)"
        @lock="emit('lock', $event)"
      />
      <QueryTestsPanel
        v-if="draftId"
        :key="`${personaId}:${draftId}:${queryTestsKey}`"
        :root="`${base}/skills/${draftId}`"
        :revision="revision"
        :training="training"
        :confirm-discard="confirmDiscard"
        :api="api"
        :disabled="busy || dirty || trainingKnowledgeDirty"
        @vue:mounted="emit('panelMounted', 'cases')"
        @dirty="emit('queryCaseDirty', $event)"
        @lock="emit('lock', $event)"
        @saved="emit('revisionSaved', $event)"
      />
      <p v-if="trainingKnowledgeDirty" class="notice">
        Conclua a inspeção e aplique a seleção compartilhada, ou descarte as alterações antes de
        revisar a publicação.
      </p>
      <label
        >Prazo de revisão da publicação<input v-model="reviewDate" type="datetime-local"
      /></label>
      <button
        :disabled="!draftId || dirty || queryCaseDirty || trainingKnowledgeDirty"
        @click="emit('preview')"
      >
        Revisar publicação
      </button>
      <div v-if="preview">
        <h3>Revisão {{ preview.revision }}</h3>
        <p>Próxima revisão: {{ new Date(preview.reviewDueAt).toLocaleString() }}</p>
        <p>Validade: {{ new Date(preview.expiresAt).toLocaleString() }}</p>
        <p v-for="warning in preview.warnings" :key="warning" class="notice">
          {{
            warning === "SEM_CASOS_DE_TESTE"
              ? "Esta consulta ainda não possui casos de teste cadastrados."
              : warning
          }}
        </p>
        <PublicationReview :preview="preview" />
        <details>
          <summary>Ver pacote e alterações de permissões</summary>
          <pre>{{ JSON.stringify(preview, null, 2) }}</pre>
        </details>
        <label class="check"
          ><input v-model="confirmed" type="checkbox" />Revisei o SQL, a estrutura e as regras deste
          pacote.</label
        ><button :disabled="!confirmed || dirty" @click="emit('publish')">
          Confirmar publicação
        </button>
      </div>
    </fieldset>
  </section>
  <p v-else-if="!busy" class="notice">
    Para treinar consultas SQL, conecte primeiro uma base.
    <RouterLink :to="{ name: 'sources' }">Conectar primeira base</RouterLink>. Skills externas usam
    uma integração e têm cadastro próprio abaixo.
  </p>
  <FederationSkillEditor
    v-if="sources.length"
    :key="`federation-skill:${personaId}:${federationSkillKey}`"
    :base="base"
    :sources="sources"
    :api="api"
    :disabled="busy"
    :confirm-discard="confirmDiscard"
    @vue:mounted="emit('panelMounted', 'federation')"
    @dirty="emit('federationDirty', $event)"
    @lock="emit('lock', $event)"
    @changed="emit('changed')"
  />
  <ExternalSkillEditor
    :key="`external-skill:${personaId}:${externalSkillKey}`"
    :base="base"
    :api="api"
    :disabled="busy"
    :confirm-discard="confirmDiscard"
    @vue:mounted="emit('panelMounted', 'external')"
    @dirty="emit('externalDirty', $event)"
    @lock="emit('lock', $event)"
    @changed="emit('changed')"
  />
  <OperationSkillEditor
    v-if="sources.length"
    :key="`operation-skill:${personaId}:${operationSkillKey}`"
    :base="base"
    :sources="sources"
    :api="api"
    :disabled="busy"
    :confirm-discard="confirmDiscard"
    @vue:mounted="emit('panelMounted', 'operation')"
    @dirty="emit('operationDirty', $event)"
    @lock="emit('lock', $event)"
    @changed="emit('changed')"
  />
</template>
