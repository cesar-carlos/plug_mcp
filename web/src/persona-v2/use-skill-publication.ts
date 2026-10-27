import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { publicationDeadline } from "./publication-deadline";

export function useSkillPublication<
  TPreview extends { confirmationHash: string },
  TResult = unknown,
>(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  previewUrl: () => string;
  publishUrl: () => string;
  canReview: () => boolean;
  canPublish: () => boolean;
  onPublished: (result: TResult) => Promise<void>;
  publishedMessage: string;
  message: Ref<string>;
  onChanged: () => void;
}): {
  reviewDate: Ref<string>;
  confirmed: Ref<boolean>;
  preview: Ref<TPreview | undefined>;
  dirty: ComputedRef<boolean>;
  review: () => Promise<void>;
  publish: () => Promise<void>;
  reset: () => void;
  clearPreview: () => void;
} {
  const reviewDate = ref("");
  const confirmed = ref(false);
  const preview = ref<TPreview>();
  const dirty = computed(() => !!reviewDate.value);
  function clearPreview(): void {
    preview.value = undefined;
    confirmed.value = false;
  }
  function reset(): void {
    reviewDate.value = "";
    clearPreview();
  }
  watch(reviewDate, clearPreview);
  async function review(): Promise<void> {
    if (!input.canReview()) {
      return;
    }
    await input.run(async () => {
      const result = await input.api<TPreview>(input.previewUrl(), {
        reviewDueAt: publicationDeadline(reviewDate.value),
      });
      if (input.isLive()) {
        preview.value = result;
        confirmed.value = false;
      }
    });
  }
  async function publish(): Promise<void> {
    if (!preview.value || !confirmed.value || !input.canPublish()) {
      return;
    }
    const confirmationHash = preview.value.confirmationHash;
    await input.run(async () => {
      const result = await input.api<TResult>(input.publishUrl(), { confirmationHash });
      if (!input.isLive()) {
        return;
      }
      reset();
      await input.onPublished(result);
      if (input.isLive()) {
        input.onChanged();
        input.message.value = input.publishedMessage;
      }
    });
  }
  return { reviewDate, confirmed, preview, dirty, review, publish, reset, clearPreview };
}
