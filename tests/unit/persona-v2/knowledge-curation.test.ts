import { expect, it } from "vitest";
import {
  applyKnowledgeChange,
  proposalTarget,
} from "../../../src/application/persona-v2/knowledge-curation.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
import { knowledgeChangeSchema } from "../../../src/domain/persona-v2/knowledge-curation.js";
const services = { crypto: new NodeCryptoAdapter("a".repeat(64)), now: () => new Date() };
it("mantém exemplos explícitos como candidatos sem modificar o conteúdo base", () => {
  const base = structureContent(),
    original = JSON.stringify(base),
    value = { ...base.examples[0]!, id: "new-example" };
  const next = applyKnowledgeChange(
    base,
    knowledgeChangeSchema.parse({ kind: "exemplo_sql", value }),
    services,
  );
  expect(next.examples.find((e) => e.id === "new-example")?.state).toBe("candidate");
  expect(next.examples.find((e) => e.id === base.examples[0]!.id)?.state).toBe("approved");
  expect(JSON.stringify(base)).toBe(original);
});
it("SQL inválido continua recusado para um exemplo candidato", () => {
  const base = structureContent(),
    value = {
      ...base.examples[0]!,
      variants: [{ ...base.examples[0]!.variants[0]!, sql: "DELETE FROM orders" }],
    };
  expect(() =>
    applyKnowledgeChange(
      base,
      knowledgeChangeSchema.parse({ kind: "exemplo_sql", value }),
      services,
    ),
  ).toThrow();
});
it("alvo de revisão é explícito e não engloba itens sem relação", () => {
  const base = structureContent(),
    change = { kind: "regra" as const, value: "Nova regra" };
  const next = applyKnowledgeChange(base, change, services);
  expect(proposalTarget(base, change)).toBeNull();
  expect(proposalTarget(next, change)).toBe("Nova regra");
  expect(next.tables).toEqual(base.tables);
});
