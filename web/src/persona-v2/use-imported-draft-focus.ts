import { nextTick, watch, type ComputedRef, type Ref } from "vue";
import type { ImportedDraftReference } from "./model";
import type { ConsoleArea } from "./navigation";

export function importedDraftFocusIsCurrent(
  target: Pick<ImportedDraftReference, "personaId" | "skillId">,
  pending: Pick<ImportedDraftReference, "personaId" | "skillId"> | undefined,
  state: {
    logged: boolean;
    area: ConsoleArea;
    personaId: string;
    draftId: string;
  },
): boolean {
  return (
    pending === target &&
    state.logged &&
    state.area === "training" &&
    state.personaId === target.personaId &&
    state.draftId === target.skillId
  );
}

export function useImportedDraftFocus(options: {
  importedDraftFocus: Ref<Pick<ImportedDraftReference, "personaId" | "skillId"> | undefined>;
  busy: Ref<boolean>;
  area: ComputedRef<ConsoleArea> | Ref<ConsoleArea>;
  personaId: Ref<string>;
  draftId: Ref<string>;
  logged: Ref<boolean>;
  importedPanelsReady: ComputedRef<boolean>;
}): void {
  const { importedDraftFocus, busy, area, personaId, draftId, logged, importedPanelsReady } =
    options;
  watch(
    [importedDraftFocus, busy, area, personaId, draftId, importedPanelsReady],
    async () => {
      const target = importedDraftFocus.value;
      if (!target) {
        return;
      }
      const current = (): boolean =>
        importedDraftFocusIsCurrent(target, importedDraftFocus.value, {
          logged: logged.value,
          area: area.value,
          personaId: personaId.value,
          draftId: draftId.value,
        });
      if (!current()) {
        importedDraftFocus.value = undefined;
        return;
      }
      if (busy.value || !importedPanelsReady.value) {
        return;
      }
      await nextTick();
      if (!current() || busy.value || !importedPanelsReady.value) {
        return;
      }
      const input = document.querySelector<HTMLElement>('[data-error-field="training:name"]');
      if (input && !input.matches(":disabled") && input.getClientRects().length) {
        input.focus();
        importedDraftFocus.value = undefined;
      }
    },
    { flush: "post" },
  );
}
