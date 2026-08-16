import { describe, expect, it } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";

describe("mapPlugServerFailure", () => {
  it("maps JSON-RPC -32001 to MISSING_CLIENT_TOKEN", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: { response: { item: { error: { code: -32001, message: "missing_client_token" } } } },
    });
    expect(err.code).toBe("MISSING_CLIENT_TOKEN");
    expect(err.retryable).toBe(false);
    expect(err.hint).toContain("configurar_client_token");
  });

  it("maps -32013 with retryAfterMs", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: { error: { code: -32013, message: "rate", data: { retry_after_ms: 1500 } } },
        },
      },
    });
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(1500);
    expect(err.message).not.toMatch(/HTTP 429/i);
  });

  it("maps HTTP 503 to AGENT_UNAVAILABLE", () => {
    const err = mapPlugServerFailure({
      status: 503,
      body: { message: "unavailable" },
      retryAfterMs: 3000,
    });
    expect(err.code).toBe("AGENT_UNAVAILABLE");
    expect(err.retryable).toBe(true);
    expect(err.message).toBe("plug-server temporariamente indisponível.");
    expect(err.message).not.toMatch(/HTTP 503/i);
  });

  it("maps HTTP 429 to RATE_LIMITED", () => {
    const err = mapPlugServerFailure({
      status: 429,
      body: { message: "too many" },
      retryAfterMs: 2000,
    });
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryable).toBe(true);
    expect(err.message).toBe("Rate limit do plug-server.");
    expect(err.message).not.toMatch(/HTTP 429/i);
  });

  it("maps HTTP 403 to AGENT_ACCESS_DENIED", () => {
    const err = mapPlugServerFailure({ status: 403, body: { code: "AGENT_ACCESS_DENIED" } });
    expect(err.code).toBe("AGENT_ACCESS_DENIED");
    expect(err.hint).toContain("verificar_status_ambiente");
  });

  it("dá um hint específico quando -32002 é SQL não classificável (ex.: SELECT sem FROM)", () => {
    // Payload real observado num teste live contra o plug-server de produção: client_token
    // totalmente permissivo (all_tables/all_permissions true), mas "SELECT 1" sem FROM é negado.
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32002,
              message: "Not authorized",
              data: {
                reason: "unauthorized",
                technical_message: "Authorization denied: unsupported SQL classification",
                user_message:
                  "Comando SQL nao suportado para autorizacao. Revise a consulta enviada.",
              },
            },
          },
        },
      },
    });
    expect(err.code).toBe("ACCESS_REVOKED");
    expect(err.retryable).toBe(false);
    expect(err.message).toBe("Acesso SQL recusado ou token revogado neste agente.");
    expect(err.message).not.toMatch(/classification|SELECT|sysobjects/i);
    expect(err.hint).toContain("FROM referenciando uma tabela/view real");
  });

  it("não devolve a mensagem crua do plug-server no DomainError", () => {
    const err = mapPlugServerFailure({
      status: 502,
      body: { message: "SQL syntax error near SELECT * FROM ClienteSecreto" },
    });
    expect(err.code).toBe("PLUG_SERVER_ERROR");
    expect(err.message).toBe("Falha ao comunicar com o plug-server.");
    expect(err.message).not.toContain("ClienteSecreto");
  });
});
