import { describe, expect, it } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";

describe("mapPlugServerFailure", () => {
  it("maps JSON-RPC -32001 missing_client_token to MISSING_CLIENT_TOKEN", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32001,
              message: "missing_client_token",
              data: { reason: "missing_client_token" },
            },
          },
        },
      },
    });
    expect(err.code).toBe("MISSING_CLIENT_TOKEN");
    expect(err.retryable).toBe(false);
    expect(err.source).toBe("client_token_rpc");
    expect(err.hint).toContain("registrar_acesso");
  });

  it("maps JSON-RPC -32001 sem data.reason para MISSING_CLIENT_TOKEN (legado)", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: { response: { item: { error: { code: -32001, message: "missing_client_token" } } } },
    });
    expect(err.code).toBe("MISSING_CLIENT_TOKEN");
    expect(err.source).toBe("client_token_rpc");
  });

  it("maps -32001 invalid_signature to ACCESS_REVOKED, not MISSING_CLIENT_TOKEN", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32001,
              message: "unauthorized",
              data: { reason: "invalid_signature" },
            },
          },
        },
      },
    });
    expect(err.code).toBe("ACCESS_REVOKED");
    expect(err.code).not.toBe("MISSING_CLIENT_TOKEN");
    expect(err.source).toBe("client_token_rpc");
    expect(err.hint).toMatch(/assinatura|autenticação/i);
    expect(err.hint).not.toMatch(/Grave o client_token/);
    expect(err.hint).not.toContain("registrar_acesso");
    expect(err.toJson().error.nextAction).toBe("atualizar_credencial_plug");
  });

  it("maps -32001 authentication_failed to ACCESS_REVOKED, not MISSING_CLIENT_TOKEN", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32001,
              message: "auth failed",
              data: { reason: "authentication_failed" },
            },
          },
        },
      },
    });
    expect(err.code).toBe("ACCESS_REVOKED");
    expect(err.source).toBe("client_token_rpc");
    expect(err.hint).not.toMatch(/Grave o client_token/);
    expect(err.hint).not.toContain("registrar_acesso");
    expect(err.hint).toMatch(/atualizar_credencial_plug/);
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
    expect(err.source).toBe("plug_server_http");
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
    expect(err.source).toBe("plug_server_http");
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
    expect(err.source).toBe("sql_engine");
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
    expect(err.source).toBe("client_token_rpc");
    expect(err.hint).toMatch(/não é o validador do pacote/i);
  });

  it("não devolve a mensagem crua do plug-server no DomainError", () => {
    const err = mapPlugServerFailure({
      status: 502,
      body: { message: "SQL syntax error near SELECT * FROM ClienteSecreto" },
    });
    expect(err.code).toBe("PLUG_SERVER_ERROR");
    expect(err.message).toBe("Falha ao comunicar com o plug-server.");
    expect(err.message).not.toContain("ClienteSecreto");
    expect(err.hint).toMatch(/syntax error/i);
    expect(err.details).toEqual(
      expect.objectContaining({ engineMessage: expect.stringMatching(/ClienteSecreto/) }),
    );
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
    expect(err.source).toBe("sql_engine");
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

  it("mapeia -32009 com Invalid column name para hint/details do motor", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32009,
              message: "Invalid column name 'foo'.",
              data: { technical_message: "Invalid column name 'foo'." },
            },
          },
        },
      },
    });
    expect(err.code).toBe("INVALID_SQL");
    expect(err.source).toBe("sql_engine");
    expect(err.message).toBe(
      "O motor SQL no agente recusou o SQL (não foi o validador do pacote MCP).",
    );
    expect(err.hint).toMatch(/Invalid column name/);
    expect(err.nextAction).toBe("mapear_tabela");
    expect(err.details).toEqual(
      expect.objectContaining({
        rpcCode: -32009,
        engineMessage: expect.stringMatching(/Invalid column name/),
      }),
    );
  });
  it("maps HTTP 403 pending Client to CLIENT_NOT_ACTIVE", () => {
    const err = mapPlugServerFailure({
      status: 403,
      body: { code: "pending", message: "Client is pending" },
    });
    expect(err.code).toBe("CLIENT_NOT_ACTIVE");
    expect(err.hint).toMatch(/ativar o Client/i);
    expect(err.source).toBe("plug_server_http");
  });

  it("mapeia -32009 com invalid_payload para PLUG_SERVER_ERROR, não INVALID_SQL/sql_engine", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32009,
              message: "invalid payload",
              data: { reason: "invalid_payload" },
            },
          },
        },
      },
    });
    expect(err.code).toBe("PLUG_SERVER_ERROR");
    expect(err.code).not.toBe("INVALID_SQL");
    expect(err.source).toBe("plug_server_http");
    expect(err.source).not.toBe("sql_engine");
    expect(err.hint).toMatch(/Não reescreva o SQL/);
    expect(err.hint).toMatch(/invalid_payload|PayloadFrame|batch/i);
    expect(err.hint).not.toMatch(/sqlModelo de obter_skill/);
  });

  it("não promove -32009 invalid_payload a sql_engine mesmo se o haystack parecer motor", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32009,
              message: "Invalid column name 'foo'. syntax error",
              data: {
                reason: "invalid_payload",
                technical_message: "Invalid column name 'foo'. SQLSTATE 42P01",
              },
            },
          },
        },
      },
    });
    expect(err.code).toBe("PLUG_SERVER_ERROR");
    expect(err.code).not.toBe("INVALID_SQL");
    expect(err.source).toBe("plug_server_http");
    expect(err.source).not.toBe("sql_engine");
    expect(err.hint).toMatch(/Não reescreva o SQL/);
    expect(err.hint).not.toMatch(/sqlModelo de obter_skill/);
  });

  it("mapeia -32101 sql_validation_failed para INVALID_SQL + sql_engine", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32101,
              message: "SQL validation failed",
              data: {
                reason: "sql_validation_failed",
                technical_message: "syntax error near FROM",
              },
            },
          },
        },
      },
    });
    expect(err.code).toBe("INVALID_SQL");
    expect(err.source).toBe("sql_engine");
    expect(err.retryable).toBe(false);
    expect(err.hint).toMatch(/syntax error/);
    expect(err.details).toEqual(
      expect.objectContaining({
        rpcCode: -32101,
        reason: "sql_validation_failed",
        engineMessage: expect.stringMatching(/syntax error/),
      }),
    );
  });

  it("mapeia -32102 sql_execution_failed para INVALID_SQL com Motor, não PLUG_SERVER_ERROR", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32102,
              message: "SQL execution failed",
              data: {
                reason: "sql_execution_failed",
                user_message: "Nao foi possivel executar a consulta.",
                technical_message: "Invalid column name 'foo'.",
              },
            },
          },
        },
      },
    });
    expect(err.code).toBe("INVALID_SQL");
    expect(err.source).toBe("sql_engine");
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/não foi o validador do pacote MCP/i);
    expect(err.hint).toMatch(/Invalid column name/);
    expect(err.hint).toMatch(/Não persista/);
    expect(err.hint).not.toMatch(/Nao foi possivel executar/i);
    expect(err.nextAction).toBe("mapear_tabela");
    expect(err.details).toEqual(
      expect.objectContaining({
        rpcCode: -32102,
        reason: "sql_execution_failed",
        engineMessage: expect.stringMatching(/Invalid column name/),
      }),
    );
  });

  it("mapeia -32107 query_timeout para QUERY_TIMEOUT", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: { error: { code: -32107, message: "timeout", data: { reason: "query_timeout" } } },
        },
      },
    });
    expect(err.code).toBe("QUERY_TIMEOUT");
    expect(err.retryable).toBe(true);
    expect(err.source).toBe("sql_engine");
    expect(err.nextAction).toBe("agregar_ou_reduzir");
    expect(err.hint).toMatch(/Não persista/);
  });

  it("mapeia -32014 replay_detected sem tratar como SQL", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: { code: -32014, message: "replay", data: { reason: "replay_detected" } },
          },
        },
      },
    });
    expect(err.code).toBe("PLUG_SERVER_ERROR");
    expect(err.retryable).toBe(false);
    expect(err.source).toBe("plug_server_http");
    expect(err.hint).toMatch(/replay_detected/);
    expect(err.hint).not.toMatch(/pacote MCP \(TABELA_FORA/);
  });

  it("mapeia HTTP 404 de agentId nunca registado para AGENT_UNAVAILABLE sem retry cego", () => {
    const err = mapPlugServerFailure({
      status: 404,
      body: { code: "NOT_FOUND", message: "Agent not found" },
    });
    expect(err.code).toBe("AGENT_UNAVAILABLE");
    expect(err.retryable).toBe(false);
    expect(err.source).toBe("plug_server_http");
    expect(err.nextAction).toBe("verificar_acesso");
    expect(err.hint).toMatch(/nunca fez agent:register/i);
    expect(err.hint).toMatch(/-32000/);
  });

  it("mapeia -32000 agent_disconnected_at_dispatch com hint distinto de HTTP 404", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32000,
              message: "agent_offline",
              data: { reason: "agent_disconnected_at_dispatch" },
            },
          },
        },
      },
    });
    expect(err.code).toBe("AGENT_UNAVAILABLE");
    expect(err.retryable).toBe(true);
    expect(err.hint).toMatch(/desconectou no dispatch/i);
    expect(err.hint).toMatch(/HTTP 404/);
  });

  it("redige JWT e client_token na mensagem do motor", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32102,
              message: "fail",
              data: {
                technical_message:
                  "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb client_token=secret-token-value",
              },
            },
          },
        },
      },
    });
    expect(err.hint).toMatch(/\[redacted\]/);
    expect(err.hint).not.toMatch(/eyJhbGci/);
    expect(err.hint).not.toContain("secret-token-value");
    const details = err.details as { engineMessage?: string };
    expect(details.engineMessage).not.toContain("secret-token-value");
  });

  it("redige client_token em JSON com aspas na chave", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: {
              code: -32102,
              message: "fail",
              data: {
                technical_message: 'payload {"client_token":"secret-json-token"} syntax error',
              },
            },
          },
        },
      },
    });
    const details = err.details as { engineMessage?: string };
    expect(details.engineMessage).toMatch(/\[redacted\]/);
    expect(details.engineMessage).not.toContain("secret-json-token");
    expect(err.hint).not.toContain("secret-json-token");
  });

  it("mapeia -32105 result_too_large para CONSULTA_ORCAMENTO", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: {
        response: {
          item: {
            error: { code: -32105, message: "too large", data: { reason: "result_too_large" } },
          },
        },
      },
    });
    expect(err.code).toBe("CONSULTA_ORCAMENTO");
    expect(err.source).toBe("sql_engine");
    expect(err.nextAction).toBe("agregar_ou_reduzir");
    expect(err.hint).toMatch(/não reenvie o mesmo SELECT largo/i);
  });

  it("HTTP 502 com haystack denied/permission sem RPC de policy não vira PERMISSION_DENIED", () => {
    const err = mapPlugServerFailure({
      status: 502,
      body: { message: "permission denied by gateway" },
    });
    expect(err.code).toBe("PLUG_SERVER_ERROR");
    expect(err.code).not.toBe("PERMISSION_DENIED");
    expect(err.source).toBe("plug_server_http");
    expect(err.source).not.toBe("client_token_rpc");
  });

  it("HTTP 200 com permission denied sem RPC continua PERMISSION_DENIED de policy", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: { message: "permission denied" },
    });
    expect(err.code).toBe("PERMISSION_DENIED");
    expect(err.source).toBe("client_token_rpc");
  });

  it("HTTP 502 com RPC -32002 de policy continua ACCESS_REVOKED", () => {
    const err = mapPlugServerFailure({
      status: 502,
      body: {
        response: {
          item: { error: { code: -32002, message: "Not authorized", data: { reason: "revoked" } } },
        },
      },
    });
    expect(err.code).toBe("ACCESS_REVOKED");
    expect(err.source).toBe("client_token_rpc");
  });
});
