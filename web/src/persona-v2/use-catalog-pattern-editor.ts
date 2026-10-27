import { computed, watch, type ComputedRef, type Ref, ref } from "vue";
import { publicationDeadline } from "./publication-deadline";
import {
  catalogEditorDirty,
  catalogEditorFingerprint,
  catalogPatternSwitchHasPendingWork,
  type CatalogPattern,
  type CatalogPreview,
} from "./catalog-panel";

export function useCatalogPatternEditor(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  catalogPath: ComputedRef<string>;
  confirmDiscard: () => Promise<boolean>;
  refresh: () => Promise<void>;
  message: Ref<string>;
}): {
  patternId: Ref<string>;
  slug: Ref<string>;
  name: Ref<string>;
  content: Ref<unknown>;
  reviewDate: Ref<string>;
  preview: Ref<CatalogPreview | undefined>;
  confirmed: Ref<boolean>;
  dirty: ComputedRef<boolean>;
  edit: (pattern: CatalogPattern) => Promise<void>;
  newPattern: () => Promise<void>;
  importFile: (event: Event) => Promise<void>;
  save: () => Promise<void>;
  prepare: () => Promise<void>;
  publish: () => Promise<void>;
  resetEditor: () => void;
  clearPublicationPreview: () => void;
} {
  const patternId = ref("");
  const slug = ref("");
  const name = ref("");
  const revision = ref(0);
  const content = ref<unknown>();
  const saved = ref("");
  const reviewDate = ref("");
  const preview = ref<CatalogPreview>();
  const confirmed = ref(false);
  const fingerprint = computed(() =>
    catalogEditorFingerprint(slug.value, name.value, content.value),
  );
  const dirty = computed(() =>
    catalogEditorDirty({
      slug: slug.value,
      name: name.value,
      content: content.value,
      saved: saved.value,
    }),
  );
  function clearPublicationPreview(): void {
    preview.value = undefined;
    confirmed.value = false;
  }
  watch(reviewDate, clearPublicationPreview);
  watch(fingerprint, clearPublicationPreview);
  function resetEditor(): void {
    reviewDate.value = "";
    patternId.value = "";
    slug.value = "";
    name.value = "";
    revision.value = 0;
    content.value = undefined;
    saved.value = "";
    clearPublicationPreview();
  }
  async function edit(pattern: CatalogPattern): Promise<void> {
    if (
      catalogPatternSwitchHasPendingWork(dirty.value, reviewDate.value) &&
      !(await input.confirmDiscard())
    ) {
      return;
    }
    patternId.value = pattern.id;
    reviewDate.value = "";
    slug.value = pattern.slug;
    name.value = pattern.name;
    revision.value = pattern.revision;
    content.value = JSON.parse(JSON.stringify(pattern.content)) as unknown;
    saved.value = fingerprint.value;
  }
  async function newPattern(): Promise<void> {
    if (
      !catalogPatternSwitchHasPendingWork(dirty.value, reviewDate.value) ||
      (await input.confirmDiscard())
    ) {
      resetEditor();
    }
  }
  async function importFile(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = "";
    if (!file) {
      return;
    }
    await input.run(async () => {
      if (file.size > 50 * 1024 || !file.name.toLowerCase().endsWith(".json")) {
        throw new Error("Selecione um arquivo JSON de até 50 KiB.");
      }
      const parsed: unknown = JSON.parse(await file.text());
      if (input.isLive()) {
        content.value = parsed;
      }
    });
  }
  async function save(): Promise<void> {
    await input.run(async () => {
      const result = await input.api<{ pattern: CatalogPattern }>(
        patternId.value
          ? `${input.catalogPath.value}/padroes/${patternId.value}/editar`
          : `${input.catalogPath.value}/padroes`,
        patternId.value
          ? { expectedRevision: revision.value, name: name.value, content: content.value }
          : { slug: slug.value, name: name.value, content: content.value },
      );
      if (!input.isLive()) {
        return;
      }
      const pattern = result.pattern;
      patternId.value = pattern.id;
      revision.value = pattern.revision;
      content.value = pattern.content;
      saved.value = fingerprint.value;
      await input.refresh();
      input.message.value = "Rascunho salvo. A publicação exige revisão de um curador.";
    });
  }
  async function prepare(): Promise<void> {
    await input.run(async () => {
      const result = await input.api<CatalogPreview>(
        `${input.catalogPath.value}/padroes/${patternId.value}/preview`,
        { reviewDueAt: publicationDeadline(reviewDate.value) },
      );
      if (input.isLive()) {
        preview.value = result;
        confirmed.value = false;
      }
    });
  }
  async function publish(): Promise<void> {
    if (!preview.value || !confirmed.value || dirty.value) {
      return;
    }
    await input.run(async () => {
      await input.api(`${input.catalogPath.value}/padroes/${patternId.value}/publicar`, {
        confirmationHash: preview.value!.confirmationHash,
      });
      reviewDate.value = "";
      if (!input.isLive()) {
        return;
      }
      clearPublicationPreview();
      await input.refresh();
      input.message.value =
        "Versão compartilhada publicada. Adoção pelas fontes ainda exige compatibilidade e republicação das skills.";
    });
  }
  return {
    patternId,
    slug,
    name,
    content,
    reviewDate,
    preview,
    confirmed,
    dirty,
    edit,
    newPattern,
    importFile,
    save,
    prepare,
    publish,
    resetEditor,
    clearPublicationPreview,
  };
}
