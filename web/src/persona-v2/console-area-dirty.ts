import type { ConsoleArea } from "./navigation";

export interface ConsoleDirtySnapshot {
  notificationsDirty: boolean;
  operationActionsDirty: boolean;
  trainingDirty: boolean;
  queryCaseDirty: boolean;
  trainingKnowledgeDirty: boolean;
  hasReviewDate: boolean;
  operationSkillDirty: boolean;
  federationSkillDirty: boolean;
  externalSkillDirty: boolean;
  iconDirty: boolean;
  sourceKnowledgeDirty: boolean;
  explorerDirty: boolean;
  knowledgeMaintenanceDirty: boolean;
  sourceDirty: boolean;
  anySourceEditorDirty: boolean;
  settingsDirty: boolean;
  newPersonaDirty: boolean;
  tokenDirty: boolean;
  knowledgeDirty: boolean;
  federationDirty: boolean;
  queryDirty: boolean;
  externalTestsDirty: boolean;
  externalActionsDirty: boolean;
  integrationManagementDirty: boolean;
}

export function consoleAreaDirty(area: ConsoleArea, flags: ConsoleDirtySnapshot): boolean {
  if (area === "operations") {
    return flags.notificationsDirty || flags.operationActionsDirty;
  }
  if (area === "training") {
    return (
      flags.trainingDirty ||
      flags.queryCaseDirty ||
      flags.trainingKnowledgeDirty ||
      flags.hasReviewDate ||
      flags.operationSkillDirty ||
      flags.federationSkillDirty ||
      flags.externalSkillDirty ||
      flags.iconDirty
    );
  }
  if (area === "knowledge") {
    return flags.sourceKnowledgeDirty || flags.explorerDirty || flags.knowledgeMaintenanceDirty;
  }
  if (area === "sources") {
    return flags.sourceDirty || flags.sourceKnowledgeDirty || flags.anySourceEditorDirty;
  }
  if (area === "overview") {
    return flags.settingsDirty || flags.iconDirty;
  }
  if (area === "personas") {
    return flags.newPersonaDirty;
  }
  if (area === "tokens") {
    return flags.tokenDirty;
  }
  if (area === "catalog") {
    return flags.knowledgeDirty;
  }
  if (area === "queries") {
    return flags.federationDirty || flags.queryDirty;
  }
  if (area === "integrations") {
    return (
      flags.externalTestsDirty || flags.externalActionsDirty || flags.integrationManagementDirty
    );
  }
  return false;
}

export function personaWorkspaceDirty(flags: ConsoleDirtySnapshot): boolean {
  return (
    flags.queryDirty ||
    flags.integrationManagementDirty ||
    flags.externalSkillDirty ||
    flags.federationSkillDirty ||
    flags.operationSkillDirty ||
    flags.queryCaseDirty ||
    flags.trainingDirty ||
    flags.hasReviewDate ||
    flags.sourceKnowledgeDirty ||
    flags.explorerDirty ||
    flags.knowledgeMaintenanceDirty ||
    flags.trainingKnowledgeDirty ||
    flags.settingsDirty ||
    flags.iconDirty ||
    flags.notificationsDirty ||
    flags.sourceDirty ||
    flags.federationDirty ||
    flags.externalTestsDirty ||
    flags.operationActionsDirty ||
    flags.externalActionsDirty ||
    flags.tokenDirty ||
    flags.anySourceEditorDirty
  );
}

export function consoleAnyDirty(flags: ConsoleDirtySnapshot): boolean {
  return personaWorkspaceDirty(flags) || flags.newPersonaDirty || flags.knowledgeDirty;
}
