import { expect, it } from "vitest";
import { computed } from "vue";
import { externalContractSchema } from "../../../src/domain/persona-v2/external-contract";
import {
  emptyExternalContract,
  newExternalContractFrom,
  proposedRemoteSchema,
  NEW_EXTERNAL_OPERATION,
  editableExternalContract,
  importedExternalContract,
  externalDraftStale,
  externalTestsRevisionChanged,
} from "./external-editor";
const field = {
  type: "string" as const,
  required: true,
  purpose: "Identificador sintético",
  classification: "livre" as const,
};
const contract = () => ({
  ...emptyExternalContract(),
  integrationId: "11111111-1111-4111-8111-111111111111",
  purpose: "Serviço isolado",
  effectDescription: "Criar referência",
  reconciliation: "Conferir a chave sem repetir",
  transport: {
    kind: "mcp_http" as const,
    tool: "register",
    inputSchema: proposedRemoteSchema({ id: field }),
    outputSchema: proposedRemoteSchema({ id: field }),
  },
  input: { id: { ...field } },
  output: { id: { ...field } },
});
it("edição de campos e schemas permanece reativa sem transformar o conteúdo remoto", () => {
  const c = editableExternalContract(contract()),
    fingerprint = computed(() => JSON.stringify(c)),
    before = fingerprint.value;
  c.input.id.purpose = "Finalidade revisada";
  expect(fingerprint.value).not.toBe(before);
  const previous = fingerprint.value;
  if (c.transport.kind !== "mcp_http") {
    throw new Error("fixture");
  }
  c.transport.inputSchema = {
    type: "object",
    properties: { id: { type: "string", pattern: "unsafe" } },
  };
  expect(fingerprint.value).not.toBe(previous);
  expect(externalContractSchema.safeParse(c).success).toBe(false);
});
it("nova ação começa com aprovação humana, sem inventar integração, propósito ou credencial", () => {
  expect(emptyExternalContract().approval).toBe("human");
  expect(externalContractSchema.safeParse(emptyExternalContract()).success).toBe(false);
  expect(JSON.stringify(emptyExternalContract())).not.toMatch(/password|credential|bearer/);
});
it("nova skill copia somente contrato editável, separando identidade e referências mutáveis", () => {
  const original = {
    ...contract(),
    approval: "automatic" as const,
    operationId: "22222222-2222-4222-8222-222222222222",
  };
  const copy = newExternalContractFrom(original);
  expect(copy.operationId).toBe(NEW_EXTERNAL_OPERATION);
  expect(copy.approval).toBe("human");
  copy.input.id.purpose = "Outra finalidade";
  expect(original.input.id.purpose).not.toBe(copy.input.id.purpose);
  expect(copy).not.toHaveProperty("publicationId");
  expect(copy).not.toHaveProperty("cases");
});
it("schemas propostos têm tipos e obrigatoriedade explícitos; divergência remota não é removida silenciosamente", () => {
  const c = contract();
  expect(externalContractSchema.parse(c)).toEqual(c);
  c.transport.inputSchema = { ...c.transport.inputSchema, properties: { id: { type: "number" } } };
  expect(externalContractSchema.safeParse(c).success).toBe(false);
  expect(c.input.id.type).toBe("string");
});
it("restrições remotas não suportadas permanecem recusadas, mesmo com campos locais correspondentes", () => {
  const c = contract();
  const raw = {
    ...c,
    transport: {
      ...c.transport,
      inputSchema: {
        ...c.transport.inputSchema,
        properties: { id: { type: "string", enum: ["one"] } },
      },
    },
  };
  expect(externalContractSchema.safeParse(raw).success).toBe(false);
});
it("proposta importada preenche só o formulário e limpa efeito de consulta", () => {
  const action = importedExternalContract(
    {
      purpose: "Registrar",
      effect: "acao",
      transport: { kind: "rest", method: "POST", path: "/x" },
      input: { id: { ...field } },
      output: { id: { ...field } },
    },
    "11111111-1111-4111-8111-111111111111",
  );
  expect(action.integrationId).toBe("11111111-1111-4111-8111-111111111111");
  expect(action.approval).toBe("human");
  const query = importedExternalContract(
    {
      purpose: "Consultar",
      effect: "consulta",
      transport: { kind: "rest", method: "GET", path: "/x" },
      input: { id: { ...field } },
      output: { id: { ...field } },
    },
    "11111111-1111-4111-8111-111111111111",
  );
  expect(query.approval).toBeUndefined();
  expect(query.effectDescription).toBeUndefined();
  expect(query.reconciliation).toBeUndefined();
});
it("detecta contrato ou revisão divergentes sem alterar o rascunho", () => {
  const current = contract();
  expect(
    externalDraftStale({ contract: current, name: "Serviço isolado" }, current, "Serviço isolado"),
  ).toBe(false);
  expect(
    externalDraftStale({ contract: current, name: "Serviço isolado" }, current, "Outro nome"),
  ).toBe(true);
  expect(
    externalTestsRevisionChanged(
      { revision: 1, packageHash: "aa", casesHash: "bb" },
      { revision: 1, packageHash: "aa", casesHash: "bb" },
    ),
  ).toBe(false);
  expect(
    externalTestsRevisionChanged(
      { revision: 1, packageHash: "aa", casesHash: "bb" },
      { revision: 2, packageHash: "aa", casesHash: "bb" },
    ),
  ).toBe(true);
});
