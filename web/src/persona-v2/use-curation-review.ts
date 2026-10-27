import { computed, nextTick, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";
import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema";
import type { Content } from "./knowledge-model";
import type { ProfilePublication } from "./knowledge-model";
import type { CurationProposal } from "./curation-proposal";

export interface CurationPreview {
  confirmationHash: string;
  expiresAt: string;
  content: Content;
  patternRevision?: number;
  profileRevision?: number;
  changes: { kind: string; path: string }[];
}

export function useCurationReview(input: {
  physical?: { sourceBase: string; publication: ProfilePublication };
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  draftDirty: () => boolean;
  confirmDiscard: () => Promise<boolean>;
  root: () => string;
  refresh: () => Promise<void>;
  message: Ref<string>;
  error: Ref<string>;
  emitUpdated: (resourceId: string) => void;
}): {
  selected: Ref<CurationProposal | undefined>;
  reason: Ref<string>;
  confirmed: Ref<boolean>;
  preview: Ref<CurationPreview | undefined>;
  dirty: ComputedRef<boolean>;
  select: (proposal: CurationProposal) => Promise<void>;
  review: () => Promise<void>;
  decide: (action: "incorporar" | "rejeitar") => Promise<void>;
} {
  const selected = ref<CurationProposal>();
  const confirmed = ref(false);
  const reason = ref("");
  const preview = ref<CurationPreview>();
  const dirty = computed(() => !!reason.value || confirmed.value);
  const timer = window.setInterval(() => {
    if (preview.value && Date.parse(preview.value.expiresAt) <= Date.now()) {
      preview.value = undefined;
      confirmed.value = false;
      input.message.value = "Revisão expirada. Revise novamente.";
    }
  }, 1000);
  onBeforeUnmount(() => {
    window.clearInterval(timer);
  });
  async function select(proposal: CurationProposal): Promise<void> {
    if ((reason.value || confirmed.value) && !(await input.confirmDiscard())) {
      return;
    }
    selected.value = proposal;
    reason.value = "";
    confirmed.value = false;
    preview.value = undefined;
    input.error.value = "";
    input.message.value = "";
  }
  async function review(): Promise<void> {
    if (!selected.value || input.draftDirty()) {
      return;
    }
    const id = selected.value.id;
    await input.run(async () => {
      const data = await input.api<{
        confirmationHash: string;
        expiresAt: string;
        content: unknown;
        patternRevision?: number;
        profileRevision?: number;
        changes: { kind: string; path: string }[];
      }>(`${input.root()}/${id}/preview`, {});
      if (input.isLive()) {
        preview.value = { ...data, content: structureContentSchema.parse(data.content) };
        confirmed.value = false;
      }
    });
  }
  async function decide(action: "incorporar" | "rejeitar"): Promise<void> {
    if (!selected.value || !confirmed.value || !reason.value.trim() || input.draftDirty()) {
      return;
    }
    const current = selected.value;
    const currentPreview = preview.value;
    let changed = "";
    await input.run(async () => {
      if (action === "incorporar" && !currentPreview) {
        throw new Error("Revise o conteúdo exato antes de incorporar.");
      }
      await input.api(
        `${input.root()}/${current.id}/${action}`,
        action === "incorporar"
          ? { confirmationHash: currentPreview!.confirmationHash, reason: reason.value }
          : { expectedVersion: current.version, reason: reason.value },
      );
      if (!input.isLive()) {
        return;
      }
      selected.value = undefined;
      reason.value = "";
      confirmed.value = false;
      preview.value = undefined;
      await input.refresh();
      input.message.value =
        action === "incorporar"
          ? `Proposta incorporada somente ao rascunho. Revise exemplos e publique ${input.physical ? "o perfil" : "o padrão"} separadamente; skills e tokens permanecem sem atualização automática.`
          : "Proposta rejeitada; conteúdo e publicações preservados.";
      if (action === "incorporar") {
        changed = "profileId" in current ? current.profileId : current.patternId;
      }
    });
    await nextTick();
    if (input.isLive() && changed) {
      input.emitUpdated(changed);
    }
  }
  return { selected, reason, confirmed, preview, dirty, select, review, decide };
}
