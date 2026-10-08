export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Resposta do servidor incompatível. Atualize a página ou tente novamente.");
  }
  return value as Record<string, unknown>;
};
export const stringField = (row: Record<string, unknown>, key: string): string => {
  if (typeof row[key] !== "string") {
    throw new Error("Resposta do servidor incompatível.");
  }
  return row[key];
};
export const records = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    throw new Error("Resposta do servidor incompatível.");
  }
  return value.map(record);
};
export const optionalString = (row: Record<string, unknown>, key: string): string | undefined => {
  if (row[key] === undefined || row[key] === null) {
    return undefined;
  }
  return stringField(row, key);
};
export const booleanField = (row: Record<string, unknown>, key: string): boolean => {
  if (typeof row[key] !== "boolean") {
    throw new Error("Resposta do servidor incompatível.");
  }
  return row[key];
};
