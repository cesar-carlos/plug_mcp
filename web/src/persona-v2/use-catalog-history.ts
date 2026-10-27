import { watch, type ComputedRef, type Ref, ref } from "vue";
import {
  catalogReviewPending,
  type CatalogComparison,
  type CatalogPublication,
} from "./catalog-panel";

export function useCatalogHistory(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  catalogPath: ComputedRef<string>;
  confirmDiscard: () => Promise<boolean>;
  refresh: () => Promise<void>;
  message: Ref<string>;
  onSuspended: () => void;
}): {
  versions: Ref<CatalogPublication[]>;
  historyPatternId: Ref<string>;
  nextCursor: Ref<string | null>;
  beforeId: Ref<string>;
  afterId: Ref<string>;
  comparison: Ref<CatalogComparison | undefined>;
  reviewDirty: Ref<Record<string, boolean>>;
  history: (id: string, cursor?: string) => Promise<void>;
  compare: () => Promise<void>;
  suspend: (publication: CatalogPublication) => Promise<void>;
  resetHistory: () => void;
  onReviewDirty: (id: string, value: boolean) => void;
} {
  const versions = ref<CatalogPublication[]>([]);
  const historyPatternId = ref("");
  const nextCursor = ref<string | null>(null);
  const beforeId = ref("");
  const afterId = ref("");
  const comparison = ref<CatalogComparison>();
  const reviewDirty = ref<Record<string, boolean>>({});
  function resetHistory(): void {
    reviewDirty.value = {};
    versions.value = [];
    historyPatternId.value = "";
    nextCursor.value = null;
    beforeId.value = "";
    afterId.value = "";
    comparison.value = undefined;
  }
  async function history(id: string, cursor?: string): Promise<void> {
    if (!cursor && catalogReviewPending(reviewDirty.value) && !(await input.confirmDiscard())) {
      return;
    }
    await input.run(async () => {
      if (!cursor) {
        resetHistory();
      }
      const result = await input.api<{
        publications: CatalogPublication[];
        nextCursor: string | null;
      }>(
        `${input.catalogPath.value}/padroes/${id}/versoes${cursor ? `?beforeId=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (!input.isLive()) {
        return;
      }
      historyPatternId.value = id;
      versions.value = cursor ? [...versions.value, ...result.publications] : result.publications;
      nextCursor.value = result.nextCursor;
      comparison.value = undefined;
    });
  }
  async function compare(): Promise<void> {
    await input.run(async () => {
      comparison.value = undefined;
      const result = await input.api<CatalogComparison>(`${input.catalogPath.value}/comparar`, {
        beforeId: beforeId.value,
        afterId: afterId.value,
      });
      if (input.isLive()) {
        comparison.value = result;
      }
    });
  }
  async function suspend(publication: CatalogPublication): Promise<void> {
    await input.run(async () => {
      await input.api(`${input.catalogPath.value}/publicacoes/${publication.id}/suspender`, {});
      if (!input.isLive()) {
        return;
      }
      resetHistory();
      input.onSuspended();
      await input.refresh();
      input.message.value = "Versão suspensa. O conteúdo publicado foi preservado.";
    });
  }
  function onReviewDirty(id: string, value: boolean): void {
    reviewDirty.value[id] = value;
  }
  watch([beforeId, afterId], () => {
    comparison.value = undefined;
  });
  return {
    versions,
    historyPatternId,
    nextCursor,
    beforeId,
    afterId,
    comparison,
    reviewDirty,
    history,
    compare,
    suspend,
    resetHistory,
    onReviewDirty,
  };
}
