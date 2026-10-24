import { z } from "zod";
import { PersonaV2Error } from "./model.js";

export interface QueryLimits {
  maxRows: number;
  maxBytes: number;
  timeoutMs: number;
  pageSize: number;
}
export interface OperationLimits {
  maxAffectedRows: number;
  timeoutMs: number;
}
export const QUERY_LIMITS: Readonly<QueryLimits> = {
  maxRows: 5000,
  maxBytes: 16 * 1024 * 1024,
  timeoutMs: 60000,
  pageSize: 5000,
};
export const OPERATION_LIMITS: Readonly<OperationLimits> = {
  maxAffectedRows: 100000,
  timeoutMs: 300000,
};
const bounded = (max: number) => z.number().int().positive().max(max).optional();
export const queryLimitsSchema = z.strictObject({
  maxRows: bounded(QUERY_LIMITS.maxRows),
  maxBytes: bounded(QUERY_LIMITS.maxBytes),
  timeoutMs: bounded(QUERY_LIMITS.timeoutMs),
  pageSize: bounded(QUERY_LIMITS.pageSize),
});
export const operationLimitsSchema = z.strictObject({
  maxAffectedRows: bounded(OPERATION_LIMITS.maxAffectedRows),
  timeoutMs: bounded(OPERATION_LIMITS.timeoutMs),
});

export function reduceLimits<T extends QueryLimits | OperationLimits>(
  base: T,
  ...layers: readonly Partial<T>[]
): T {
  const result = { ...base };
  for (const layer of layers)
    for (const key of Object.keys(base) as (keyof T)[]) {
      const value = layer[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
        throw new PersonaV2Error("INVALID_PLAN", "Limite de execução inválido.");
      result[key] = Math.min(result[key] as number, value) as T[keyof T];
    }
  return result;
}
export function queryLimits(...layers: readonly Partial<QueryLimits>[]): QueryLimits {
  const result = reduceLimits(QUERY_LIMITS, ...layers);
  return { ...result, pageSize: Math.min(result.pageSize, result.maxRows) };
}
export const operationLimits = (...layers: readonly Partial<OperationLimits>[]): OperationLimits =>
  reduceLimits(OPERATION_LIMITS, ...layers);
