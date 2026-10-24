import { describe, expect, it } from "vitest";
import { operationTraining } from "../../../tests/helpers/persona-v2-operation";
import {
  publicationGrant,
  publicationEffectsLabel,
  publicationExternalOperations,
} from "./publication-grant";
import type { GrantPublication } from "./model";

function operation(): GrantPublication {
  return {
    id: "published",
    revision: 4,
    suspendedAt: null,
    hash: "hash",
    package: {
      format: "persona-sql-operation-v2",
      name: "Atualizar pedido",
      dialect: "postgres",
      training: operationTraining(),
      requiredCapabilities: ["published-contract"],
    },
  };
}
describe("concessão explícita da publicação", () => {
  it("vincula a operação externa exata sem conceder efeitos SQL", () => {
    const published = operation();
    published.package.format = "persona-external-v2";
    published.package.training = { operationId: "external-operation", effect: "acao" };
    expect(publicationGrant("external-skill", published)).toEqual({
      skillId: "external-skill",
      capabilities: ["published-contract"],
      effects: [],
      requireHumanApproval: true,
    });
    expect(publicationExternalOperations(published)).toEqual(["external-operation"]);
    expect(publicationEffectsLabel(published)).toContain("Ação externa");
    published.package.training.effect = "consulta";
    expect(publicationGrant("external-skill", published).requireHumanApproval).toBe(false);
    expect(publicationEffectsLabel(published)).toBe("Consulta externa");
    published.suspendedAt = new Date().toISOString();
    expect(() => publicationExternalOperations(published)).toThrow("suspensa");
  });
  it("não fabrica identidade externa a partir de contrato incompleto ou SQL", () => {
    const published = operation();
    expect(publicationExternalOperations(published)).toEqual([]);
    published.package.format = "persona-external-v2";
    expect(() => publicationGrant("skill", published)).toThrow("externo incompleto");
    expect(() => publicationExternalOperations(published)).toThrow("externo incompleto");
  });
  it("concede somente os efeitos exigidos, inicia com aprovação e não altera snapshot", () => {
    const published = operation();
    const before = structuredClone(published);
    const grant = publicationGrant("skill", published);
    expect(grant.effects).toEqual(["update"]);
    expect(grant.requireHumanApproval).toBe(true);
    expect(grant.capabilities).toEqual(["published-contract"]);
    grant.capabilities.push("local");
    expect(published).toEqual(before);
    expect(publicationEffectsLabel(published)).toBe("UPDATE");
  });
  it("inclui SELECT auxiliar exigido por outputs SQL Anywhere", () => {
    const published = operation();
    published.package.dialect = "sybase";
    const training = operationTraining();
    published.package.training = training;
    training.steps[0].outputs = [{ column: "id", type: "integer" }];
    expect(publicationGrant("skill", published).effects).toEqual(["update", "select"]);
  });
  it("não acrescenta SELECT por outputs de outro dialeto nem duplica efeitos", () => {
    const published = operation();
    const training = operationTraining();
    training.steps[0].outputs = [{ column: "id", type: "integer" }];
    training.steps.push(structuredClone(training.steps[0]));
    published.package.training = training;
    expect(publicationGrant("skill", published).effects).toEqual(["update"]);
    published.package.dialect = "sybase";
    expect(publicationGrant("skill", published).effects).toEqual(["update", "select"]);
  });
  it("recusa contrato incompleto, formato desconhecido e publicação suspensa", () => {
    const published = operation();
    published.package.training = undefined;
    expect(() => publicationGrant("skill", published)).toThrow("incompleto");
    expect(publicationEffectsLabel(published)).toContain("indisponível");
    published.package.format = "future";
    expect(() => publicationGrant("skill", published)).toThrow("não suportado");
    published.suspendedAt = new Date().toISOString();
    expect(() => publicationGrant("skill", published)).toThrow("suspensa");
  });
  it("preserva consulta e cruzamento somente leitura sem aprovação adicional", () => {
    for (const format of ["persona-query-v2", "persona-federation-v2"]) {
      const published = operation();
      published.package.format = format;
      expect(publicationGrant("skill", published)).toMatchObject({
        effects: ["select"],
        requireHumanApproval: false,
      });
    }
  });
});
