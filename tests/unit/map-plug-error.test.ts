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
    expect(err.hint).toContain("registrar_acesso");
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
    expect(err.hint).toContain("ativar o Client");
  });

  it("mapeia -32002 classification para INVALID_SQL, não ACCESS_REVOKED", () => {
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
    expect(err.code).toBe("INVALID_SQL");
    expect(err.retryable).toBe(false);
    expect(err.message).toBe("O agente não classificou este SQL para autorização.");
    expect(err.message).not.toMatch(/classification|SELECT 1|sysobjects|revogado/i);
    expect(err.hint).toContain("Não trate como token revogado");
    expect(err.hint).not.toContain("SELECT 1");
  });

  it("mantém ACCESS_REVOKED quando -32002 não é classification", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: { error: { code: -32002, message: "Not authorized", data: { reason: "revoked" } } },
        },
      },
    });
    expect(err.code).toBe("ACCESS_REVOKED");
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

  it("mapeia SQL Server 1033 do wrap gerenciado para INVALID_SQL, não PLUG_SERVER_ERROR", () => {
    const err = mapPlugServerFailure(
      {
        status: 200,
        body: {
          response: {
            item: {
              error: {
                message: "ODBC error",
                data: {
                  technical_message:
                    "[SQL Server] The ORDER BY clause is invalid in views, inline functions, derived tables, subqueries, and common table expressions, unless TOP, OFFSET or FOR XML is also specified. (1033) FROM ContaReceber",
                },
              },
            },
          },
        },
      },
      undefined,
      "sql.execute",
    );
    expect(err.code).toBe("INVALID_SQL");
    expect(err.retryable).toBe(false);
    expect(err.source).toBe("client_token_rpc");
    expect(err.stage).toBe("sql.execute");
    expect(err.nextAction).toBe("consultar_dados");
    expect(err.message).toMatch(/paginação gerenciada/i);
    expect(err.message).not.toContain("ContaReceber");
    expect(err.hint).toMatch(/1033/);
    expect(err.hint).toMatch(/options\.page/);
    expect(err.hint).toMatch(/OFFSET\/FETCH/);
    expect(err.hint).toMatch(/guia:\/\/dialeto\/mssql/);
    expect(err.hint).not.toContain("ContaReceber");
  });

  it("mapeia -32009 com 1033 para o hint de paginação, não o genérico de dialeto", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32009,
              message: "The ORDER BY clause is invalid in derived tables (1033)",
            },
          },
        },
      },
    });
    expect(err.code).toBe("INVALID_SQL");
    expect(err.hint).toMatch(/Não repita options\.page/);
    expect(err.hint).not.toMatch(/sqlModelo de obter_skill/);
  });
  it("maps HTTP 403 pending Client to CLIENT_NOT_ACTIVE", () => {
    const err = mapPlugServerFailure({
      status: 403,
      body: { code: "pending", message: "Client is pending" },
    });
    expect(err.code).toBe("CLIENT_NOT_ACTIVE");
    expect(err.hint).toMatch(/ativar o Client/i);
  });
});
