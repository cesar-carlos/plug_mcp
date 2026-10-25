<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useErrorSummary } from "./useErrorSummary";

const props = defineProps<{
  base: string;
  busy: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{ dirty: [value: boolean] }>();
const revision = ref(0);
const chosen = ref<File | "padrao" | null>(null);
const previewUrl = ref("");
const { error, errorSummary } = useErrorSummary();
let live = true;
const dirty = computed(() => chosen.value !== null);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
const shown = computed(() => {
  if (previewUrl.value) return previewUrl.value;
  if (chosen.value === "padrao" || revision.value === 0) return "/brand/icon-192.png";
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
  error.value = "";
  const result = await props.api<{ revision: number }>(`${props.base}/icone`);
  if (!live) return;
  revision.value = result.revision;
  chosen.value = null;
  releasePreview();
}
onMounted(() => {
  void load().catch((cause: unknown) => {
    if (!live) return;
    error.value = cause instanceof Error ? cause.message : "Não foi possível ler o ícone.";
  });
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
  const input = fileChoice(event.target);
  const file = input?.files?.item(0) ?? null;
  releasePreview();
  if (!input || !file) {
    chosen.value = null;
    return;
  }
  if (file.size > 512 * 1024) {
    chosen.value = null;
    error.value = "Escolha uma imagem de até 512 KiB. PNG, JPEG ou WebP.";
    input.value = "";
    return;
  }
  error.value = "";
  chosen.value = file;
  previewUrl.value = URL.createObjectURL(file);
}

function useDefault() {
  releasePreview();
  error.value = "";
  chosen.value = revision.value === 0 ? null : "padrao";
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw new Error("Não foi possível ler o arquivo.");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

async function save() {
  const selection = chosen.value;
  if (!selection) return;
  error.value = "";
  try {
    const image = selection === "padrao" ? null : await fileToBase64(selection);
    const result = await props.api<{ revision: number }>(`${props.base}/icone`, {
      expectedRevision: revision.value,
      image,
    });
    if (!live) return;
    revision.value = result.revision;
    chosen.value = null;
    releasePreview();
  } catch (cause) {
    if (!live) return;
    error.value = cause instanceof Error ? cause.message : "Não foi possível salvar o ícone.";
  }
}
</script>

<template>
  <section aria-label="Ícone da persona">
    <h3>Ícone da persona</h3>
    <p>
      Sem uma imagem escolhida, o registro usa o ícone Se7e. A troca vale para esta persona e não
      altera publicação, token nem concessões.
    </p>
    <img :src="shown" alt="" width="64" height="64" />
    <form @submit.prevent="save">
      <fieldset :disabled="busy">
        <label
          >Imagem PNG, JPEG ou WebP
          <input type="file" accept="image/png,image/jpeg,image/webp" @change="selectFile" />
        </label>
        <button type="submit" :disabled="!dirty">Salvar ícone</button>
        <button
          type="button"
          class="secondary"
          :disabled="revision === 0 && !dirty"
          @click="useDefault"
        >
          Usar ícone padrão
        </button>
      </fieldset>
    </form>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
  </section>
</template>
