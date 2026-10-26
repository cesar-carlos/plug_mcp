<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useErrorSummary } from "./useErrorSummary";
import { lazyPanel } from "./lazy-panel";
import { ConsoleRequestError } from "./model";
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
const revision = ref(0);
const hasIcon = ref(false);
const chosen = ref<File | "padrao" | null>(null);
const previewUrl = ref("");
const fileInput = ref<HTMLInputElement>();
const loading = ref(false);
const loaded = ref(false);
const saving = ref(false);
const saved = ref("");
const helpId = useId();
const showMascots = ref(false);
const choosingMascot = ref(false);
const selectedMascot = ref<string | null>(null);
const savedMascot = ref<string | null>(null);
const needsReload = ref(false);
const locked = computed(() => props.busy || loading.value || saving.value || choosingMascot.value);
const { error, errorSummary } = useErrorSummary();
let live = true;
const dirty = computed(() => chosen.value !== null);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
const shown = computed(() => {
  if (previewUrl.value) return previewUrl.value;
  if (chosen.value === "padrao" || !hasIcon.value) return "/brand/icon-192.png";
  return `/brand/personas/${props.base.split("/").at(-1)}/icon?v=${revision.value}`;
});

function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}
onBeforeUnmount(() => {
  live = false;
  releasePreview();
});

async function load() {
  if (loading.value || saving.value || choosingMascot.value || !live) return;
  loading.value = true;
  error.value = "";
  try {
    const result = await props.api<{ revision: number; hasIcon: boolean }>(`${props.base}/icone`);
    if (!live) return;
    revision.value = result.revision;
    hasIcon.value = result.hasIcon;
    loaded.value = true;
    savedMascot.value = null;
    emit("current", { base: props.base, ...result });
    if (needsReload.value)
      saved.value = dirty.value
        ? "Versão salva conferida. Sua escolha local foi mantida; revise antes de salvar."
        : "Versão salva conferida.";
    needsReload.value = false;
  } catch (cause) {
    if (live)
      error.value = cause instanceof Error ? cause.message : "Não foi possível ler o ícone.";
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  void load();
});

interface FileChoice {
  files: { item(index: number): File | null } | null;
  value: string;
}

function fileChoice(target: EventTarget | null): FileChoice | null {
  if (target !== null && "files" in target && "value" in target) return target as FileChoice;
  return null;
}

function selectFile(event: Event) {
  if (locked.value || !loaded.value) return;
  const input = fileChoice(event.target);
  const file = input?.files?.item(0) ?? null;
  if (!input || !file) return;
  if (
    !file.size ||
    file.size > 512 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  ) {
    error.value = "Escolha PNG, JPEG ou WebP de até 512 KiB, com conteúdo.";
    input.value = "";
    return;
  }
  releasePreview();
  saved.value = "";
  error.value = "";
  chosen.value = file;
  selectedMascot.value = null;
  previewUrl.value = URL.createObjectURL(file);
}

function useDefault() {
  if (locked.value || !loaded.value) return;
  releasePreview();
  error.value = "";
  saved.value = "";
  if (fileInput.value) fileInput.value.value = "";
  chosen.value = hasIcon.value ? "padrao" : null;
  selectedMascot.value = null;
}

function chooseMascot(file: File, id: string) {
  if (!live || props.busy || loading.value || saving.value || !loaded.value) return;
  releasePreview();
  error.value = "";
  saved.value = "";
  if (fileInput.value) fileInput.value.value = "";
  chosen.value = file;
  selectedMascot.value = id;
  previewUrl.value = URL.createObjectURL(file);
}

function discard() {
  if (locked.value) return;
  chosen.value = null;
  selectedMascot.value = null;
  releasePreview();
  if (fileInput.value) fileInput.value.value = "";
  if (!needsReload.value) error.value = "";
  saved.value = "Alterações locais descartadas.";
  fileInput.value?.focus();
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new Error("Não foi possível ler o arquivo.");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

async function save() {
  if (locked.value || !loaded.value || needsReload.value) return;
  const selection = chosen.value;
  if (!selection) return;
  saving.value = true;
  saved.value = "";
  error.value = "";
  try {
    const image = selection === "padrao" ? null : await fileToBase64(selection);
    if (!live) return;
    const result = await props.api<{ revision: number; hasIcon: boolean }>(`${props.base}/icone`, {
      expectedRevision: revision.value,
      image,
    });
    if (!live) return;
    revision.value = result.revision;
    hasIcon.value = result.hasIcon;
    savedMascot.value = selectedMascot.value;
    selectedMascot.value = null;
    emit("current", { base: props.base, ...result });
    chosen.value = null;
    if (fileInput.value) fileInput.value.value = "";
    saved.value = selection === "padrao" ? "Ícone padrão salvo." : "Ícone atualizado.";
    releasePreview();
  } catch (cause) {
    if (!live) return;
    if (
      cause instanceof ConsoleRequestError &&
      ["OPERATION_CONFLICT", "RESPONSE_UNCONFIRMED"].includes(cause.code)
    ) {
      needsReload.value = true;
      error.value =
        cause.code === "OPERATION_CONFLICT"
          ? "O ícone foi alterado em outra aba ou sessão. Sua escolha local foi preservada. Confira a versão salva antes de tentar salvar novamente."
          : "Não foi possível confirmar o salvamento. Sua escolha local foi preservada. Confira a versão salva antes de decidir o próximo passo.";
    } else
      error.value = cause instanceof Error ? cause.message : "Não foi possível salvar o ícone.";
  } finally {
    saving.value = false;
  }
}
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
    <form @submit.prevent="save">
      <fieldset :disabled="locked || !loaded">
        <label
          >Imagem PNG, JPEG ou WebP
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            :aria-describedby="helpId"
            @change="selectFile"
          />
        </label>
        <button type="submit" :disabled="!dirty || needsReload">Salvar ícone</button>
        <button type="button" class="secondary" :disabled="!dirty" @click="discard">
          Descartar alterações do ícone
        </button>
        <button type="button" class="secondary" :disabled="!hasIcon && !dirty" @click="useDefault">
          Usar ícone padrão
        </button>
      </fieldset>
    </form>
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
input[type="file"] {
  max-width: 100%;
  min-width: 0;
}
</style>
