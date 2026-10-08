import { api, codeFromSetupUrl, type SetupComplete } from "../api";
import { optionalString, record, stringField } from "../validation";

export const completeSetup = async (
  beginPath: string,
  fields: Record<string, string>,
  bearer?: string,
): Promise<SetupComplete> => {
  const begin = record(await api.post(beginPath, {}, bearer));
  const code = codeFromSetupUrl(stringField(begin, "setupUrl"));
  if (!code) {
    throw new Error("Operação de conexão incompatível. Gere uma nova operação.");
  }
  const form = record(await api.get(`/app/api/setup/${encodeURIComponent(code)}`, bearer));
  const result = record(
    await api.post(`/setup/${encodeURIComponent(code)}`, {
      csrf: stringField(form, "csrf"),
      confirmado: "sim",
      ...fields,
    }),
  );
  return {
    success: true,
    token: optionalString(result, "token"),
    acessoId: optionalString(result, "acessoId"),
  };
};
