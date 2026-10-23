import { it, expect } from "vitest";
import { importOpenApi, importMcpTools } from "../../../src/domain/persona-v2/external-import.js";
const shape = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
};
const openApiFixture = () => ({
  openapi: "3.1.0",
  servers: [{ url: "https://untrusted.example.com" }],
  components: { schemas: { Record: shape } },
  paths: {
    "/lookup": {
      get: {
        summary: "Consultar referência",
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Registro",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Record" } } },
          },
        },
      },
    },
  },
});
it("OpenAPI interpreta só contrato local e não adota destino/autoridade do documento", () => {
  const [candidate] = importOpenApi(openApiFixture());
  expect(candidate?.proposal).toMatchObject({
    effect: "consulta",
    transport: { kind: "rest", method: "GET", path: "/lookup" },
    input: { id: { type: "string", required: true } },
    output: { id: { type: "string", required: true } },
  });
  expect(JSON.stringify(candidate)).not.toContain("untrusted.example.com");
});
it.each([
  { $ref: "https://elsewhere.example.com/schema.json" },
  { type: "string", enum: ["a"] },
  { type: "integer" },
  { type: "string", format: "date" },
  { type: "object", properties: { nested: { type: "object" } } },
])("não remove restrição ou referência não suportada %j", (schema) => {
  const doc = openApiFixture();
  Object.assign(doc.paths["/lookup"].get.parameters[0]!, { schema });
  expect(importOpenApi(doc)[0]?.proposal).toBeNull();
});
it("recusa caminho parametrizado, duplicação de parâmetro e múltiplas respostas de sucesso", () => {
  const doc = openApiFixture();
  expect(
    importOpenApi({ ...doc, paths: { "/lookup/{id}": doc.paths["/lookup"] } })[0]?.proposal,
  ).toBeNull();
  doc.paths["/lookup"].get.parameters.push(doc.paths["/lookup"].get.parameters[0]!);
  expect(importOpenApi(doc)[0]?.proposal).toBeNull();
  const second = openApiFixture();
  Object.assign(second.paths["/lookup"].get.responses, {
    201: second.paths["/lookup"].get.responses[200],
  });
  expect(importOpenApi(second)[0]?.proposal).toBeNull();
});
it("POST com body obrigatório e 204 produz só proposta de ação sem aprovação herdada", () => {
  const result = importOpenApi({
    openapi: "3.0.3",
    paths: {
      "/record": {
        post: {
          requestBody: { required: true, content: { "application/json": { schema: shape } } },
          responses: { 204: { description: "Concluído" } },
        },
      },
    },
  });
  expect(result[0]?.proposal).toMatchObject({
    effect: "acao",
    output: {},
    input: { id: { required: true } },
  });
  expect(result[0]?.proposal).not.toHaveProperty("approval");
});
it("MCP exige outputSchema exato e preserva schemas; descriptions não viram autoridade", () => {
  const result = importMcpTools({
    complete: true,
    tools: [
      { name: "write", description: "Texto remoto", inputSchema: shape, outputSchema: shape },
      { name: "missing", inputSchema: shape },
      {
        name: "enum",
        inputSchema: { ...shape, properties: { id: { type: "string", enum: ["a"] } } },
        outputSchema: shape,
      },
    ],
  });
  expect(result[0]?.proposal).toMatchObject({
    effect: "acao",
    transport: { tool: "write", inputSchema: shape, outputSchema: shape },
  });
  expect(result.slice(1).every((c) => !c.proposal && c.issues.length)).toBe(true);
});
