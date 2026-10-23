import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import { reactive } from "vue";
export function editableExternalContract(value: ExternalContract): ExternalContract {
  // There are no Vue refs in a wire contract. Its recursive JSON schemas remain
  // opaque; this boundary avoids infinitely expanding Vue's UnwrapRef type.
  const proxy: unknown = reactive(value);
  return proxy as ExternalContract;
}
export const NEW_EXTERNAL_OPERATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export function emptyExternalContract(): ExternalContract {
  return {
    operationId: NEW_EXTERNAL_OPERATION,
    integrationId: "",
    purpose: "",
    effect: "acao",
    approval: "human",
    effectDescription: "",
    reconciliation: "",
    transport: { kind: "rest", method: "POST", path: "" },
    input: {},
    output: {},
    timeoutMs: 15000,
    maxResponseBytes: 1048576,
  };
}
export function proposedRemoteSchema(fields: ExternalContract["input"]) {
  return {
    type: "object" as const,
    properties: Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, { type: field.type }]),
    ),
    required: Object.entries(fields)
      .filter(([, field]) => field.required)
      .map(([key]) => key),
    additionalProperties: false as const,
  };
}
/** A new operation never inherits identity, cases, publication or consumer grants. */
export function newExternalContractFrom(value: ExternalContract): ExternalContract {
  return {
    ...(JSON.parse(JSON.stringify(value)) as ExternalContract),
    operationId: NEW_EXTERNAL_OPERATION,
    ...(value.effect === "acao" ? { approval: "human" as const } : {}),
  };
}
