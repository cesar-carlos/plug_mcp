import { describe, expect, it } from "vitest";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { ServiceTokenManager } from "../../src/infrastructure/plug-server/token-manager.js";
import { ConsoleTestLogger } from "../helpers/console-logger.js";
import { getLiveEnv } from "../helpers/live-env.js";

// COUNT contra catálogo de sistema (metadados do próprio banco, nunca dados de negócio do ERP).
// Descoberto via teste live: um SELECT sem FROM (ex.: "SELECT 1") não é classificável pelo
// pipeline de autorização do plug_agente e é negado com -32002/"Not authorized" mesmo com um
// client_token totalmente permissivo — o classificador de SQL precisa de uma tabela/view real no
// FROM (ver hint de ACCESS_REVOKED em map-plug-error.ts). Por isso usamos sempre uma tabela de
// sistema real, universal em cada dialeto, em vez de um "SELECT 1" puro.
const SAFE_SMOKE_SQL: Record<string, string> = {
  mssql: "SELECT COUNT(*) AS ok FROM sys.objects",
  sybase: "SELECT COUNT(*) AS ok FROM sysobjects",
  postgres: "SELECT COUNT(*) AS ok FROM pg_catalog.pg_class",
  firebird: "SELECT COUNT(*) AS ok FROM RDB$RELATIONS",
};

const liveEnv = getLiveEnv();

/**
 * Testes "live": chamam o plug-server REAL (produção/staging) com uma conta de TESTE dedicada
 * (E2E_CLIENT_EMAIL/PASSWORD). Nunca fazem parte do `npm test` padrão — só de `npm run test:live`
 * (ver vitest.live.config.ts) — e se pulam sozinhos quando as credenciais E2E_* não estão no
 * ambiente (ver tests/helpers/live-env.ts), então é seguro deixar este arquivo em qualquer máquina.
 */
describe.skipIf(!liveEnv)("plug-server live (produção)", () => {
  const env = liveEnv!;
  const logger = new ConsoleTestLogger();
  const tokens = new ServiceTokenManager(
    env.PLUG_SERVER_BASE_URL,
    env.E2E_CLIENT_EMAIL,
    env.E2E_CLIENT_PASSWORD,
    logger,
  );
  const gateway = new PlugServerRestAdapter(env.PLUG_SERVER_BASE_URL, tokens, logger);

  it("autentica a conta de teste (client-auth/login) e obtém um accessToken", async () => {
    const token = await tokens.getAccessToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("confirma que a conta de teste tem acesso aprovado ao agente de teste", async () => {
    const status = await gateway.getAgentAccessStatus(env.E2E_AGENT_ID);
    expect(status.agentId).toBe(env.E2E_AGENT_ID);
    expect(status.state).toBe("approved");
  });

  it("executa um SELECT trivial via sql.execute no dialeto configurado", async () => {
    const sql = SAFE_SMOKE_SQL[env.E2E_DIALETO];
    if (!sql) {
      throw new Error(`SAFE_SMOKE_SQL não definido para dialeto ${env.E2E_DIALETO}`);
    }
    const result = await gateway.executeSql({
      agentId: env.E2E_AGENT_ID,
      clientToken: env.E2E_CLIENT_TOKEN,
      sql,
      options: { maxRows: 1 },
    });
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
