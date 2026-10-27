import { computed, onBeforeUnmount, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import { useRouter } from "vue-router";
import {
  consoleAnyDirty,
  consoleAreaDirty,
  personaWorkspaceDirty,
  type ConsoleDirtySnapshot,
} from "./console-area-dirty";
import { consoleRouteAfterAreaChange, shouldBlockConsoleNavigation } from "./console-navigation";
import type { ContextRequests, Persona } from "./model";
import type { ConsoleArea } from "./navigation";

export interface ConsoleDiscardBindings {
  busy: Ref<boolean>;
  logged: Ref<boolean>;
  personaId: Ref<string>;
  persona: ComputedRef<Persona | undefined>;
  error: Ref<string>;
  errorFields: Ref<readonly string[]>;
  message: Ref<string>;
  menuOpen: Ref<boolean>;
  bearer: Ref<string>;
  clearQuerySession: () => void;
  queryDirty: ComputedRef<boolean>;
  trainingDirty: ComputedRef<boolean>;
  queryCaseDirty: Ref<boolean>;
  trainingKnowledgeDirty: Ref<boolean>;
  reviewDate: Ref<string>;
  operationSkillDirty: Ref<boolean>;
  federationSkillDirty: Ref<boolean>;
  externalSkillDirty: Ref<boolean>;
  sourceDirty: ComputedRef<boolean>;
  sourcesDirty: Record<string, boolean>;
  sourceLifecycleDirty: Record<string, boolean>;
  newPersonaDirty: ComputedRef<boolean>;
  resetTraining: () => void;
  remountSourceEditors: () => void;
  personaForm: { name: string; specialty: string; instructions: string };
  personaIconFile: Ref<File | undefined>;
  knowledgeRequests: ContextRequests;
}

export function useConsoleDiscard(): {
  dialogOpen: Ref<boolean>;
  confirmDiscard: () => Promise<boolean>;
  answerDiscard: (value: boolean) => void;
  tokenDirty: Ref<boolean>;
  accessKey: Ref<number>;
  settingsDirty: Ref<boolean>;
  settingsKey: Ref<number>;
  iconDirty: Ref<boolean>;
  iconKey: Ref<number>;
  notificationsDirty: Ref<boolean>;
  notificationsKey: Ref<number>;
  knowledgeDirty: Ref<boolean>;
  knowledgeKey: Ref<number>;
  sourceKnowledgeDirty: Ref<boolean>;
  explorerDirty: Ref<boolean>;
  knowledgeMaintenanceDirty: Ref<boolean>;
  sourceKnowledgeKey: Ref<number>;
  federationDirty: Ref<boolean>;
  federationKey: Ref<number>;
  externalTestsDirty: Ref<boolean>;
  externalTestsKey: Ref<number>;
  integrationManagementDirty: Ref<boolean>;
  integrationManagementKey: Ref<number>;
  operationActionsDirty: Ref<boolean>;
  operationActionsKey: Ref<number>;
  externalActionsDirty: Ref<boolean>;
  externalActionsKey: Ref<number>;
  personaDirty: ComputedRef<boolean>;
  anyDirty: ComputedRef<boolean>;
  areaDirty: (current: ConsoleArea) => boolean;
  discardArea: (current: ConsoleArea) => void;
  resetPersonaEditors: () => void;
  bind: (deps: ConsoleDiscardBindings) => void;
} {
  const router = useRouter();
  const dialogOpen = ref(false);
  let discardAnswer: ((value: boolean) => void) | undefined;
  const tokenDirty = ref(false);
  const accessKey = ref(0);
  const settingsDirty = ref(false);
  const settingsKey = ref(0);
  const iconDirty = ref(false);
  const iconKey = ref(0);
  const notificationsDirty = ref(false);
  const notificationsKey = ref(0);
  const knowledgeDirty = ref(false);
  const knowledgeKey = ref(0);
  const sourceKnowledgeDirty = ref(false);
  const explorerDirty = ref(false);
  const knowledgeMaintenanceDirty = ref(false);
  const sourceKnowledgeKey = ref(0);
  const federationDirty = ref(false);
  const federationKey = ref(0);
  const externalTestsDirty = ref(false);
  const externalTestsKey = ref(0);
  const integrationManagementDirty = ref(false);
  const integrationManagementKey = ref(0);
  const operationActionsDirty = ref(false);
  const operationActionsKey = ref(0);
  const externalActionsDirty = ref(false);
  const externalActionsKey = ref(0);
  const bound = shallowRef<ConsoleDiscardBindings>();
  let stopNavigation: (() => void) | undefined;

  function answerDiscard(value: boolean): void {
    dialogOpen.value = false;
    discardAnswer?.(value);
    discardAnswer = undefined;
  }

  function confirmDiscard(): Promise<boolean> {
    dialogOpen.value = true;
    return new Promise((resolve) => {
      discardAnswer = resolve;
    });
  }

  function snapshot(): ConsoleDirtySnapshot {
    const deps = bound.value;
    return {
      notificationsDirty: notificationsDirty.value,
      operationActionsDirty: operationActionsDirty.value,
      trainingDirty: deps?.trainingDirty.value ?? false,
      queryCaseDirty: deps?.queryCaseDirty.value ?? false,
      trainingKnowledgeDirty: deps?.trainingKnowledgeDirty.value ?? false,
      hasReviewDate: !!deps?.reviewDate.value,
      operationSkillDirty: deps?.operationSkillDirty.value ?? false,
      federationSkillDirty: deps?.federationSkillDirty.value ?? false,
      externalSkillDirty: deps?.externalSkillDirty.value ?? false,
      iconDirty: iconDirty.value,
      sourceKnowledgeDirty: sourceKnowledgeDirty.value,
      explorerDirty: explorerDirty.value,
      knowledgeMaintenanceDirty: knowledgeMaintenanceDirty.value,
      sourceDirty: deps?.sourceDirty.value ?? false,
      anySourceEditorDirty:
        Object.values(deps?.sourcesDirty ?? {}).some(Boolean) ||
        Object.values(deps?.sourceLifecycleDirty ?? {}).some(Boolean),
      settingsDirty: settingsDirty.value,
      newPersonaDirty: deps?.newPersonaDirty.value ?? false,
      tokenDirty: tokenDirty.value,
      knowledgeDirty: knowledgeDirty.value,
      federationDirty: federationDirty.value,
      queryDirty: deps?.queryDirty.value ?? false,
      externalTestsDirty: externalTestsDirty.value,
      externalActionsDirty: externalActionsDirty.value,
      integrationManagementDirty: integrationManagementDirty.value,
    };
  }

  const personaDirty = computed(() => personaWorkspaceDirty(snapshot()));
  const anyDirty = computed(() => consoleAnyDirty(snapshot()));

  function areaDirty(current: ConsoleArea): boolean {
    return consoleAreaDirty(current, snapshot());
  }

  function discardArea(current: ConsoleArea): void {
    const deps = bound.value;
    if (current === "operations") {
      operationActionsDirty.value = false;
      operationActionsKey.value++;
      notificationsDirty.value = false;
      notificationsKey.value++;
    }
    if (current === "integrations") {
      integrationManagementDirty.value = false;
      integrationManagementKey.value++;
      externalActionsDirty.value = false;
      externalActionsKey.value++;
      externalTestsDirty.value = false;
      externalTestsKey.value++;
    }
    if (current === "knowledge") {
      sourceKnowledgeDirty.value = false;
      explorerDirty.value = false;
      knowledgeMaintenanceDirty.value = false;
      sourceKnowledgeKey.value++;
    }
    if (current === "queries") {
      federationDirty.value = false;
      federationKey.value++;
    }
    if (current === "training") {
      deps?.resetTraining();
      iconDirty.value = false;
      iconKey.value++;
    }
    if (current === "sources") {
      sourceKnowledgeDirty.value = false;
      sourceKnowledgeKey.value++;
      deps?.remountSourceEditors();
    }
    if (current === "overview") {
      settingsDirty.value = false;
      settingsKey.value++;
      iconDirty.value = false;
      iconKey.value++;
    }
    if (current === "personas") {
      if (deps) {
        Object.assign(deps.personaForm, { name: "", specialty: "", instructions: "" });
        deps.personaIconFile.value = undefined;
      }
    }
    if (current === "tokens") {
      tokenDirty.value = false;
      accessKey.value++;
    }
    if (current === "catalog") {
      knowledgeKey.value++;
      knowledgeDirty.value = false;
      deps?.knowledgeRequests.reset();
    }
  }

  function resetPersonaEditors(): void {
    tokenDirty.value = false;
    accessKey.value++;
    operationActionsDirty.value = false;
    operationActionsKey.value++;
    externalActionsDirty.value = false;
    externalActionsKey.value++;
    notificationsDirty.value = false;
    notificationsKey.value++;
    externalTestsDirty.value = false;
    externalTestsKey.value++;
    integrationManagementDirty.value = false;
    integrationManagementKey.value++;
    sourceKnowledgeDirty.value = false;
    explorerDirty.value = false;
    knowledgeMaintenanceDirty.value = false;
    sourceKnowledgeKey.value++;
    federationDirty.value = false;
    federationKey.value++;
    settingsDirty.value = false;
    iconDirty.value = false;
  }

  function bind(deps: ConsoleDiscardBindings): void {
    bound.value = deps;
    if (stopNavigation) {
      return;
    }
    stopNavigation = router.beforeEach(async (to, from) => {
      if (shouldBlockConsoleNavigation(deps.busy.value, dialogOpen.value)) {
        return false;
      }
      if (deps.logged.value && to.name !== from.name && areaDirty(from.name as ConsoleArea)) {
        if (!(await confirmDiscard())) {
          return false;
        }
        discardArea(from.name as ConsoleArea);
      }
      deps.menuOpen.value = false;
      deps.error.value = "";
      deps.errorFields.value = [];
      deps.message.value = "";
      if (to.name !== "queries") {
        deps.clearQuerySession();
      }
      if (!["tokens", "queries", "knowledge"].includes(String(to.name))) {
        deps.bearer.value = "";
      }
      return consoleRouteAfterAreaChange(String(to.name), {
        logged: deps.logged.value,
        personaId: deps.personaId.value,
        personaActive: deps.persona.value?.active,
      });
    });
    window.addEventListener("beforeunload", beforeUnload);
  }

  const beforeUnload = (event: BeforeUnloadEvent): void => {
    if (anyDirty.value) {
      event.preventDefault();
    }
  };

  onBeforeUnmount(() => {
    stopNavigation?.();
    window.removeEventListener("beforeunload", beforeUnload);
    answerDiscard(false);
  });

  return {
    dialogOpen,
    confirmDiscard,
    answerDiscard,
    tokenDirty,
    accessKey,
    settingsDirty,
    settingsKey,
    iconDirty,
    iconKey,
    notificationsDirty,
    notificationsKey,
    knowledgeDirty,
    knowledgeKey,
    sourceKnowledgeDirty,
    explorerDirty,
    knowledgeMaintenanceDirty,
    sourceKnowledgeKey,
    federationDirty,
    federationKey,
    externalTestsDirty,
    externalTestsKey,
    integrationManagementDirty,
    integrationManagementKey,
    operationActionsDirty,
    operationActionsKey,
    externalActionsDirty,
    externalActionsKey,
    personaDirty,
    anyDirty,
    areaDirty,
    discardArea,
    resetPersonaEditors,
    bind,
  };
}
