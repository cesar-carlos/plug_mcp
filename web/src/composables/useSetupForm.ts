import { api, codeFromSetupUrl, type SetupBegin, type SetupComplete, type SetupForm } from "../api";

export const completeSetup = async (
  beginPath: string,
  fields: Record<string, string>,
  bearer?: string,
): Promise<SetupComplete> => {
  const begin = await api.post<SetupBegin>(beginPath, {}, bearer);
  const code = codeFromSetupUrl(begin.setupUrl);
  const form = await api.get<SetupForm>(`/app/api/setup/${encodeURIComponent(code)}`, bearer);
  return api.post<SetupComplete>(`/setup/${encodeURIComponent(code)}`, {
    csrf: form.csrf,
    confirmado: "sim",
    ...fields,
  });
};
