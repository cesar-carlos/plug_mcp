import { z } from "zod";

const liveEnvSchema = z.object({
  PLUG_SERVER_BASE_URL: z.string().url().default("https://plug-server.se7esistemassinop.com.br"),
  E2E_AGENT_ID: z.string().uuid(),
  E2E_CLIENT_TOKEN: z.string().min(1).max(512),
  E2E_CLIENT_EMAIL: z.string().email(),
  E2E_CLIENT_PASSWORD: z.string().min(1),
  E2E_DIALETO: z.enum(["mssql", "sybase", "postgres", "firebird"]).default("sybase"),
});

export type LiveEnv = z.infer<typeof liveEnvSchema>;

let cached: LiveEnv | null | undefined;

/**
 * Credenciais dos testes "live" (tests/live/), que chamam o plug-server real (produção/staging)
 * com uma conta de TESTE dedicada. Exceção local e nomeada à regra de `project_stack.mdc` ("env só
 * via config/env.ts"): estas vars não fazem parte do AppConfig de runtime da aplicação, só do
 * harness de teste — por isso vivem isoladas aqui em vez de `envSchema`.
 *
 * Retorna `null` (em vez de lançar) quando as vars não estão presentes, para os testes live se
 * pularem sozinhos (`describe.skipIf`) em máquinas/CI sem acesso a essas credenciais.
 */
export const getLiveEnv = (): LiveEnv | null => {
  if (cached !== undefined) return cached;
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente é esperado fora do dev local (ex.: CI); segue só com process.env já definido.
  }
  const parsed = liveEnvSchema.safeParse(process.env);
  cached = parsed.success ? parsed.data : null;
  return cached;
};

/** Só para os testes resetarem o cache entre casos que simulam ausência de credenciais. */
export const resetLiveEnvCache = (): void => {
  cached = undefined;
};
