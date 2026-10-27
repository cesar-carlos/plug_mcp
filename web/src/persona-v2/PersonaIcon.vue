<script setup lang="ts">
import { useId } from "vue";
import { lazyPanel } from "./lazy-panel";
import PersonaIconForm from "./PersonaIconForm.vue";
import { usePersonaIcon } from "./use-persona-icon";
const MascotGallery = lazyPanel(() => import("./MascotGallery.vue"));

const props = defineProps<{
  base: string;
  busy: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  current: [value: { base: string; revision: number; hasIcon: boolean }];
}>();
const helpId = useId();
const {
  hasIcon,
  loading,
  loaded,
  saving,
  saved,
  showMascots,
  choosingMascot,
  selectedMascot,
  savedMascot,
  needsReload,
  locked,
  dirty,
  shown,
  error,
  errorSummary,
  iconForm,
  load,
  selectFile,
  useDefault,
  chooseMascot,
  discard,
  save,
} = usePersonaIcon(props, emit);
</script>

<template>
  <section aria-label="Ícone da persona" :aria-busy="loading || saving">
    <h3>Ícone da persona</h3>
    <p class="field-help">
      Aparência da persona ·
      {{ dirty ? "prévia local, ainda não salva" : "última aparência lida do servidor" }}
    </p>
    <p>
      Sem uma imagem escolhida, o registro usa o ícone Se7e. A troca vale para esta persona e não
      altera publicação, token nem concessões.
    </p>
    <img
      :src="shown"
      alt="Prévia do ícone da persona"
      width="64"
      height="64"
      class="icon-preview"
    />
    <p :id="helpId" class="field-help">
      PNG, JPEG ou WebP, até 512 KiB. A imagem será reduzida para até 512 × 512 pixels. A alteração
      só vale depois de salvar.
    </p>
    <p v-if="loading" role="status">Carregando ícone…</p>
    <button
      v-if="!loaded && !loading"
      type="button"
      class="secondary"
      :disabled="busy"
      @click="load"
    >
      Tentar carregar ícone novamente
    </button>
    <PersonaIconForm
      ref="iconForm"
      :help-id="helpId"
      :dirty="dirty"
      :needs-reload="needsReload"
      :has-icon="hasIcon"
      :locked="locked"
      :loaded="loaded"
      @select="selectFile"
      @save="save"
      @discard="discard"
      @default="useDefault"
    />
    <button
      type="button"
      class="secondary"
      :aria-expanded="showMascots"
      :disabled="locked"
      @click="showMascots = !showMascots"
    >
      {{ showMascots ? "Fechar mascotes" : "Escolher um mascote" }}
    </button>
    <MascotGallery
      v-if="showMascots"
      allow-selection
      :selected-id="dirty ? selectedMascot : savedMascot"
      :selection-pending="dirty"
      :disabled="locked || !loaded"
      @choose="chooseMascot"
      @loading="choosingMascot = $event"
    />
    <p v-if="saving" role="status">Salvando ícone…</p>
    <p v-else-if="saved" role="status">{{ saved }}</p>
    <p v-else-if="dirty" role="status">Alteração ainda não salva.</p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <button v-if="needsReload" type="button" class="secondary" :disabled="locked" @click="load">
      Conferir versão salva sem perder minha escolha
    </button>
  </section>
</template>

<style scoped>
.icon-preview {
  object-fit: contain;
  border-radius: 0.5rem;
}
</style>
