import { z } from "zod";
import { PersonaV2Error } from "./model.js";
import type { IntegrationCredential } from "./integration-credential.js";

const field = z.strictObject({
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean(),
  purpose: z.string().trim().min(1).max(1000),
  classification: z.literal("livre"),
});
const fields = z
  .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), field)
  .refine(
    (v) =>
      Object.keys(v).length <= 64 &&
      !Object.keys(v).some((k) => ["constructor", "prototype", "__proto__"].includes(k)),
  );
const flatMcpSchema = z.strictObject({
  type: z.literal("object"),
  properties: z.record(
    z.string(),
    z.strictObject({
      type: z.enum(["string", "number", "boolean"]),
      description: z.string().optional(),
      title: z.string().optional(),
    }),
  ),
  required: z.array(z.string()).optional(),
  additionalProperties: z.literal(false).optional(),
  description: z.string().optional(),
  title: z.string().optional(),
  $schema: z.string().optional(),
});
const matchesFlatMcpSchema = (raw: unknown, declared: z.infer<typeof fields>): boolean => {
  const parsed = flatMcpSchema.safeParse(raw);
  if (!parsed.success) return false;
  const s = parsed.data,
    required = s.required ?? [];
  return (
    new Set(required).size === required.length &&
    Object.keys(s.properties).length === Object.keys(declared).length &&
    required.every((key) => Object.hasOwn(declared, key)) &&
    Object.entries(declared).every(
      ([key, f]) => s.properties[key]?.type === f.type && required.includes(key) === f.required,
    )
  );
};
const reconciliationCheckSchema = z.strictObject({
  guarantee: z.string().trim().min(1).max(5000),
  transport: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("rest"),
      method: z.literal("GET"),
      path: z
        .string()
        .max(1000)
        .regex(/^\/[A-Za-z0-9/_-]*$/),
    }),
    z.strictObject({
      kind: z.literal("mcp_http"),
      tool: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/),
      inputSchema: z.json(),
      outputSchema: z.json(),
    }),
  ]),
  input: fields,
  output: fields,
  bindings: z.record(z.string(), z.string()),
  evidence: z.strictObject({
    countField: z.string(),
    completeField: z.string(),
    correlation: z
      .array(z.strictObject({ inputField: z.string(), outputField: z.string() }))
      .min(1)
      .max(64),
    statusField: z.string(),
    appliedValue: z.union([z.string().min(1).max(8192), z.number().finite(), z.boolean()]),
  }),
});
export const externalContractSchema = z
  .strictObject({
    operationId: z.uuid(),
    integrationId: z.uuid(),
    purpose: z.string().trim().min(1).max(5000),
    effect: z.enum(["consulta", "acao"]),
    approval: z.enum(["human", "automatic"]).optional(),
    effectDescription: z.string().trim().min(1).max(5000).optional(),
    reconciliation: z.string().trim().min(1).max(5000).optional(),
    reconciliationCheck: reconciliationCheckSchema.optional(),
    transport: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("rest"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z
          .string()
          .max(1000)
          .regex(/^\/[A-Za-z0-9/_-]*$/),
      }),
      z.strictObject({
        kind: z.literal("mcp_http"),
        tool: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/),
        inputSchema: z.json(),
        outputSchema: z.json(),
      }),
    ]),
    input: fields,
    output: fields,
    timeoutMs: z.number().int().min(1).max(30000),
    maxResponseBytes: z.number().int().min(1).max(1048576),
  })
  .superRefine((v, c) => {
    if (
      v.effect === "acao" &&
      v.transport.kind === "mcp_http" &&
      (!matchesFlatMcpSchema(v.transport.inputSchema, v.input) ||
        !matchesFlatMcpSchema(v.transport.outputSchema, v.output))
    )
      c.addIssue({
        code: "custom",
        message:
          "Schema de ação MCP exige objeto plano correspondente aos campos; constraints não suportadas são recusadas.",
      });
    if (
      v.effect === "consulta" &&
      (v.approval !== undefined || v.effectDescription || v.reconciliation || v.reconciliationCheck)
    )
      c.addIssue({
        code: "custom",
        message: "Configuração de efeitos/aprovação pertence somente a ações.",
      });
    if (v.effect === "acao" && (!v.effectDescription || !v.reconciliation))
      c.addIssue({
        code: "custom",
        message: "Ação exige descrição dos efeitos e procedimento de conciliação.",
      });
    if (v.transport.kind === "rest" && (v.effect === "consulta") !== (v.transport.method === "GET"))
      c.addIssue({
        code: "custom",
        message: "GET é exclusivo de consulta; escrita requer preparação.",
      });
    const r = v.reconciliationCheck;
    if (r) {
      const e = r.evidence;
      const outputKeys = [
        e.countField,
        e.completeField,
        e.statusField,
        ...e.correlation.map((p) => p.outputField),
      ];
      const bound = Object.values(r.bindings);
      const correlated = e.correlation.map((p) => p.inputField);
      const valid =
        r.transport.kind === v.transport.kind &&
        Object.keys(r.input).length > 0 &&
        Object.keys(r.input).length === Object.keys(r.bindings).length &&
        Object.entries(r.input).every(
          ([key, f]) =>
            f.required &&
            v.input[r.bindings[key]!]?.required &&
            v.input[r.bindings[key]!]!.type === f.type,
        ) &&
        new Set(bound).size === bound.length &&
        new Set(correlated).size === correlated.length &&
        bound.length === correlated.length &&
        bound.every((key) => correlated.includes(key)) &&
        new Set(outputKeys).size === outputKeys.length &&
        outputKeys.every((key) => r.output[key]?.required) &&
        r.output[e.countField]?.type === "number" &&
        r.output[e.completeField]?.type === "boolean" &&
        r.output[e.statusField]?.type === typeof e.appliedValue &&
        e.correlation.every((p) => v.input[p.inputField]?.type === r.output[p.outputField]?.type) &&
        (r.transport.kind !== "mcp_http" ||
          (matchesFlatMcpSchema(r.transport.inputSchema, r.input) &&
            matchesFlatMcpSchema(r.transport.outputSchema, r.output)));
      if (!valid)
        c.addIssue({
          code: "custom",
          message:
            "Conciliação exige leitura do mesmo conector, chave obrigatória completa, unicidade, completude e schemas exatos.",
        });
    }
  });
export type ExternalContract = z.infer<typeof externalContractSchema>;
export const externalPackageSchema = z.strictObject({
  format: z.literal("persona-external-v2"),
  name: z.string(),
  training: externalContractSchema,
  destination: z.string(),
  credentialVersion: z.number().int().positive(),
  requiredCapabilities: z.array(z.string()),
});
export type ExternalPackage = z.infer<typeof externalPackageSchema>;
export interface ExternalPublication {
  id: string;
  personaId: string;
  skillId: string;
  revision: number;
  hash: string;
  package: ExternalPackage;
  suspendedAt: Date | null;
}
export interface ExternalConnection {
  readonly destination: string;
  readonly credential: IntegrationCredential;
}
export interface ExternalTransport {
  invoke(
    connection: ExternalConnection,
    contract: ExternalContract,
    input: Record<string, string | number | boolean>,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
  ): Promise<unknown>;
}
/** Only the durable action service supplies the one-shot beforeEffect claim. */
export interface ExternalActionTransport {
  executeAction(
    connection: ExternalConnection,
    contract: ExternalContract,
    input: Record<string, string | number | boolean>,
    signal: AbortSignal,
    beforeDispatch: () => Promise<void>,
    beforeEffect: () => Promise<void>,
  ): Promise<unknown>;
}
export const validateExternalValues = (
  fields: ExternalContract["input"],
  raw: unknown,
): Record<string, string | number | boolean> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new PersonaV2Error("INVALID_PLAN", "Objeto externo inválido.");
  const result: Record<string, string | number | boolean> = Object.create(null) as Record<
    string,
    string | number | boolean
  >;
  for (const [key, value] of Object.entries(raw)) {
    const f = fields[key];
    if (
      !Object.hasOwn(fields, key) ||
      typeof value !== f?.type ||
      (typeof value === "number" &&
        (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) ||
      (typeof value === "string" && value.length > 8192)
    )
      throw new PersonaV2Error("INVALID_PLAN", "Dados fora do contrato externo.");
    result[key] = value as string | number | boolean;
  }
  if (Object.entries(fields).some(([key, f]) => f.required && !Object.hasOwn(result, key)))
    throw new PersonaV2Error("INCOMPLETE_INPUT", "Campo obrigatório ausente.");
  return result;
};
