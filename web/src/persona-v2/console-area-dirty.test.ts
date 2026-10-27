import { describe, expect, it } from "vitest";
import {
  consoleAnyDirty,
  consoleAreaDirty,
  personaWorkspaceDirty,
  type ConsoleDirtySnapshot,
} from "./console-area-dirty";

function flags(overrides: Partial<ConsoleDirtySnapshot> = {}): ConsoleDirtySnapshot {
  return {
    notificationsDirty: false,
    operationActionsDirty: false,
    trainingDirty: false,
    queryCaseDirty: false,
    trainingKnowledgeDirty: false,
    hasReviewDate: false,
    operationSkillDirty: false,
    federationSkillDirty: false,
    externalSkillDirty: false,
    iconDirty: false,
    sourceKnowledgeDirty: false,
    explorerDirty: false,
    knowledgeMaintenanceDirty: false,
    sourceDirty: false,
    anySourceEditorDirty: false,
    settingsDirty: false,
    newPersonaDirty: false,
    tokenDirty: false,
    knowledgeDirty: false,
    federationDirty: false,
    queryDirty: false,
    externalTestsDirty: false,
    externalActionsDirty: false,
    integrationManagementDirty: false,
    ...overrides,
  };
}

describe("mapa de descarte por área", () => {
  it("mantém iconDirty em treinamentos e na visão geral", () => {
    const dirty = flags({ iconDirty: true });
    expect(consoleAreaDirty("training", dirty)).toBe(true);
    expect(consoleAreaDirty("overview", dirty)).toBe(true);
    expect(consoleAreaDirty("knowledge", dirty)).toBe(false);
    expect(consoleAreaDirty("personas", dirty)).toBe(false);
  });

  it("não trata histórico como área suja mesmo com outras edições", () => {
    const dirty = flags({
      iconDirty: true,
      trainingDirty: true,
      knowledgeDirty: true,
      tokenDirty: true,
    });
    expect(consoleAreaDirty("history", dirty)).toBe(false);
  });

  it("reúne as edições vigentes de cada área", () => {
    expect(consoleAreaDirty("operations", flags({ notificationsDirty: true }))).toBe(true);
    expect(consoleAreaDirty("operations", flags({ operationActionsDirty: true }))).toBe(true);
    expect(consoleAreaDirty("operations", flags({ operationSkillDirty: true }))).toBe(false);
    expect(consoleAreaDirty("sources", flags({ sourceKnowledgeDirty: true }))).toBe(true);
    expect(consoleAreaDirty("sources", flags({ anySourceEditorDirty: true }))).toBe(true);
    expect(consoleAreaDirty("queries", flags({ queryDirty: true }))).toBe(true);
    expect(consoleAreaDirty("catalog", flags({ knowledgeDirty: true }))).toBe(true);
    expect(consoleAreaDirty("tokens", flags({ tokenDirty: true }))).toBe(true);
    expect(consoleAreaDirty("personas", flags({ newPersonaDirty: true }))).toBe(true);
    expect(consoleAreaDirty("integrations", flags({ externalTestsDirty: true }))).toBe(true);
  });

  it("separa sujeira da persona, cadastro novo e catálogo", () => {
    expect(personaWorkspaceDirty(flags({ iconDirty: true }))).toBe(true);
    expect(personaWorkspaceDirty(flags({ newPersonaDirty: true }))).toBe(false);
    expect(personaWorkspaceDirty(flags({ knowledgeDirty: true }))).toBe(false);
    expect(consoleAnyDirty(flags({ newPersonaDirty: true }))).toBe(true);
    expect(consoleAnyDirty(flags({ knowledgeDirty: true }))).toBe(true);
    expect(consoleAnyDirty(flags())).toBe(false);
  });
});
