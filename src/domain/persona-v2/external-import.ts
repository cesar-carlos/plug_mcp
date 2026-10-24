import { z } from "zod";
import type { ExternalContract } from "./external-contract.js";
import { PersonaV2Error } from "./model.js";

export interface ExternalImportCandidate {
  key: string;
  name: string;
  proposal: Pick<ExternalContract, "purpose" | "effect" | "transport" | "input" | "output"> | null;
  issues: readonly string[];
}
export interface ExternalImportResult {
  connection: { id: string; version: number; destination: string };
  candidates: readonly ExternalImportCandidate[];
  warnings: readonly string[];
}
export interface ExternalToolCatalog {
  tools: readonly {
    name: string;
    description?: string;
    inputSchema: unknown;
    outputSchema?: unknown;
  }[];
  complete: boolean;
}
const object = (value: unknown): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(value);
const fail = (): never => {
  throw new Error("unsupported");
};
const allowed = (value: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(value).some((key) => !keys.includes(key))) fail();
};
const safeName = (name: string) =>
  /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) &&
  !["constructor", "prototype", "__proto__"].includes(name);

/** Closed grammar: a constraint that cannot be enforced is never silently removed. */
export function importExternalFields(
  raw: unknown,
  resolve: (v: unknown) => unknown = (v) => v,
): ExternalContract["input"] {
  const schema = object(resolve(raw));
  allowed(schema, [
    "type",
    "properties",
    "required",
    "additionalProperties",
    "title",
    "description",
    "$schema",
  ]);
  if (
    schema.type !== "object" ||
    (schema.additionalProperties !== undefined && schema.additionalProperties !== false)
  )
    fail();
  const properties = object(schema.properties),
    required = z
      .array(z.string())
      .max(64)
      .parse(schema.required ?? []);
  if (
    Object.keys(properties).length > 64 ||
    new Set(required).size !== required.length ||
    required.some((key) => !Object.hasOwn(properties, key))
  )
    fail();
  return Object.fromEntries(
    Object.entries(properties).map(([key, rawField]) => {
      if (!safeName(key)) fail();
      const field = object(resolve(rawField));
      allowed(field, ["type", "title", "description"]);
      const type = z.enum(["string", "number", "boolean"]).parse(field.type);
      return [
        key,
        {
          type,
          required: required.includes(key),
          purpose:
            typeof field.description === "string"
              ? field.description.slice(0, 1000) || "Revisar significado"
              : "Revisar significado",
          classification: "livre" as const,
        },
      ];
    }),
  );
}
const issue =
  "Operação não representável: revise schemas, parâmetros e respostas na gramática suportada. Nenhuma restrição foi removida.";
export function importMcpTools(catalog: ExternalToolCatalog): ExternalImportCandidate[] {
  return catalog.tools.map((tool) => {
    try {
      if (!/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name) || tool.outputSchema === undefined) fail();
      const input = importExternalFields(tool.inputSchema),
        output = importExternalFields(tool.outputSchema);
      return {
        key: tool.name,
        name: tool.name,
        proposal: {
          purpose: (tool.description ?? "Revisar finalidade da ferramenta").slice(0, 5000),
          effect: "acao",
          transport: {
            kind: "mcp_http",
            tool: tool.name,
            inputSchema: z.json().parse(tool.inputSchema),
            outputSchema: z.json().parse(tool.outputSchema),
          },
          input,
          output,
        },
        issues: [],
      };
    } catch {
      return { key: tool.name, name: tool.name, proposal: null, issues: [issue] };
    }
  });
}

/** JSON only. References stay within this document; no URL or DDL is executed. */
export function importOpenApi(raw: unknown): ExternalImportCandidate[] {
  const doc = object(raw);
  if (typeof doc.openapi !== "string" || !/^3\.(0|1)\.\d+$/.test(doc.openapi)) {
    throw new PersonaV2Error("INVALID_PLAN", "Importe OpenAPI 3.0/3.1 em JSON.");
  }
  const resolve = (value: unknown): unknown => {
    const record = object(value);
    if (!Object.hasOwn(record, "$ref")) return record;
    if (
      Object.keys(record).length !== 1 ||
      typeof record.$ref !== "string" ||
      !/^#\/components\/schemas\/[A-Za-z0-9_.-]+$/.test(record.$ref)
    )
      fail();
    const target = object(object(doc.components).schemas)[
      z.string().parse(record.$ref).split("/").at(-1)!
    ];
    const resolved = object(target);
    if (Object.hasOwn(resolved, "$ref")) fail();
    return resolved;
  };
  const paths = object(doc.paths),
    result: ExternalImportCandidate[] = [];
  if (Object.keys(paths).length > 128)
    throw new PersonaV2Error("INVALID_PLAN", "Até 128 rotas por importação.");
  for (const [path, rawPath] of Object.entries(paths)) {
    const item = object(rawPath);
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "trace"]) {
      if (!Object.hasOwn(item, method)) continue;
      if (result.length >= 256)
        throw new PersonaV2Error("INVALID_PLAN", "Até 256 operações por importação.");
      const key = `${method.toUpperCase()} ${path}`;
      try {
        if (!/^(get|post|put|patch|delete)$/.test(method) || !/^\/[A-Za-z0-9/_-]*$/.test(path))
          fail();
        const op = object(item[method]);
        if (op.callbacks || op.servers || item.servers || op.security) fail();
        let input: ExternalContract["input"] = {};
        const parameters = [
          ...z
            .array(z.unknown())
            .max(64)
            .parse(item.parameters ?? []),
          ...z
            .array(z.unknown())
            .max(64)
            .parse(op.parameters ?? []),
        ];
        if (method !== "get" && parameters.length) fail();
        if (method === "get") {
          if (op.requestBody) fail();
          const entries = parameters.map((rawParameter) => {
            const p = object(rawParameter);
            allowed(p, ["name", "in", "required", "description", "schema"]);
            if (
              p.in !== "query" ||
              typeof p.name !== "string" ||
              !safeName(p.name) ||
              (p.required !== undefined && typeof p.required !== "boolean")
            )
              fail();
            const name = z.string().parse(p.name);
            const fields = importExternalFields({
              type: "object",
              properties: { [name]: resolve(p.schema) },
              required: p.required ? [name] : [],
            });
            return [name, fields[name]!] as const;
          });
          if (new Set(entries.map(([name]) => name)).size !== entries.length || entries.length > 64)
            fail();
          input = Object.fromEntries(entries);
        } else if (op.requestBody) {
          const body = object(op.requestBody);
          allowed(body, ["content", "required", "description"]);
          // Optional body cannot be represented by an always-sent JSON object.
          if (body.required !== true) fail();
          const content = object(body.content);
          if (Object.keys(content).length !== 1 || !content["application/json"]) fail();
          const media = object(content["application/json"]);
          allowed(media, ["schema"]);
          input = importExternalFields(media.schema, resolve);
        }
        const responses = object(op.responses),
          success = Object.keys(responses).filter((code) => /^2\d\d$/.test(code));
        if (success.length !== 1) fail();
        const response = object(responses[success[0]!]);
        allowed(response, ["description", "content"]);
        let output: ExternalContract["output"];
        if (success[0] === "204" && response.content === undefined) output = {};
        else {
          const content = object(response.content);
          if (Object.keys(content).length !== 1 || !content["application/json"]) fail();
          const media = object(content["application/json"]);
          allowed(media, ["schema"]);
          output = importExternalFields(media.schema, resolve);
        }
        result.push({
          key,
          name: typeof op.summary === "string" ? op.summary.slice(0, 200) : key,
          proposal: {
            purpose:
              typeof op.description === "string" ? op.description.slice(0, 5000) || key : key,
            effect: method === "get" ? "consulta" : "acao",
            transport: {
              kind: "rest",
              method: method.toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
              path,
            },
            input,
            output,
          },
          issues: [],
        });
      } catch {
        result.push({ key, name: key, proposal: null, issues: [issue] });
      }
    }
  }
  return result;
}
