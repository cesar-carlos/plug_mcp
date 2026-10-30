import type { LoggerPort } from "../../../src/domain/ports/logger.port.js";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../src/domain/errors/error-codes.js";
import { adminUnexpectedFailure } from "../../../src/infrastructure/http/admin-unexpected-error.js";
import {
  personaV2ToolError,
  reportPersonaV2ToolError,
} from "../../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";

describe("falha pública da consulta", () => {
  it("usa a frase fixa do código e descarta o texto do hub", () => {
    const body = personaV2ToolError(
      new DomainError({
        code: ERROR_CODES.PLUG_SERVER_ERROR,
        message: "unsafe upstream payload password=do-not-echo",
        hint: "retry unsafe upstream payload",
        source: "plug_server_http",
      }),
    );
    expect(body).toMatchObject({
      code: "PLUG_SERVER_ERROR",
      source: "plug_server_http",
      message: "Falha ao comunicar com o plug-server.",
      retryable: false,
    });
    expect(JSON.stringify(body)).not.toContain("unsafe upstream payload");
  });

  it("preserva mensagem e orientação quando a origem é o motor SQL local", () => {
    const body = personaV2ToolError(
      new DomainError({
        code: ERROR_CODES.INVALID_SQL,
        message: "Coluna ausente no pacote.",
        hint: "Use o campo publicado.",
        source: "sql",
      }),
    );
    expect(body).toMatchObject({
      message: "Coluna ausente no pacote.",
      hint: "Use o campo publicado.",
      source: "sql",
    });
  });

  it("código sem frase pública informa só código e origem", () => {
    const body = personaV2ToolError(
      new DomainError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "segredo do motor",
        hint: "detalhe interno",
        source: "mcp",
      }),
    );
    expect(body.message).toBe("Não foi possível concluir a consulta (INTERNAL_ERROR, mcp).");
    expect(JSON.stringify(body)).not.toContain("segredo");
  });

  it("PersonaV2Error conserva a mensagem de domínio", () => {
    expect(
      personaV2ToolError(
        new PersonaV2Error("AUTHORIZATION_DENIED", "Consumidor sem autorização vigente."),
      ),
    ).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "Consumidor sem autorização vigente.",
    });
  });
});

describe("falha inesperada do console", () => {
  it("gravação do banco de controle usa código próprio e sqlstate no log", () => {
    const failure = adminUnexpectedFailure(
      Object.assign(new Error("duplicate key value violates persona_token_pkey"), {
        severity: "ERROR",
        code: "23505",
        constraint: "persona_token_pkey",
      }),
    );
    expect(failure.code).toBe("CONTROL_WRITE_FAILED");
    expect(failure.message).toContain("banco de controle");
    expect(failure.log).toEqual({
      name: "Error",
      sqlstate: "23505",
      constraint: "persona_token_pkey",
    });
    expect(failure.log).not.toHaveProperty("code");
    expect(JSON.stringify(failure)).not.toContain("duplicate key");
  });

  it("exceção sem SQLSTATE continua como autoridade indisponível", () => {
    const failure = adminUnexpectedFailure(new TypeError("reading 'skills'"));
    expect(failure.code).toBe("AUTHORITY_UNAVAILABLE");
    expect(failure.log).toEqual({ name: "TypeError" });
    expect(JSON.stringify(failure)).not.toContain("skills");
  });
});

describe("diagnóstico seguro e atendimento", () => {
  it("preserva metadados permitidos e distingue parâmetros RPC de falha de comunicação", () => {
    const error = new DomainError({
      code: ERROR_CODES.PLUG_SERVER_ERROR,
      message: "password=secret SELECT private",
      hint: "Bearer secret",
      source: "plug_server_http",
      stage: "rpc",
      details: {
        rpcCode: -32602,
        reason: "invalid_params",
        sqlstate: "42703",
        errno: "ECONNRESET",
        engineMessage: "SELECT secret",
        technical_message: "password=secret",
        nested: { token: "secret" },
      },
    });
    const body = personaV2ToolError(error);
    expect(body.message).toBe("O hub recusou o JSON-RPC: parâmetros inválidos.");
    expect(body.details).toEqual({
      rpcCode: -32602,
      reason: "invalid_params",
      sqlstate: "42703",
      errno: "ECONNRESET",
    });
    expect(body.retryable).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/secret|SELECT|Bearer/);
  });
  it.each([
    null,
    [],
    { rpcCode: Infinity },
    { rpcCode: -32602.5 },
    {
      reason: "password=secret",
      errno: "SECRET",
      sqlstate: "42703 SELECT secret",
      nested: { rpcCode: -32602 },
    },
  ])("descarta detalhes desconhecidos ou malformados: %j", (details) => {
    expect(
      personaV2ToolError(
        new DomainError({
          code: ERROR_CODES.PLUG_SERVER_ERROR,
          message: "secret",
          hint: "secret",
          details,
        }),
      ),
    ).not.toHaveProperty("details");
  });
  it("gera IDs únicos e registra somente metadados correlacionáveis, inclusive exceções inesperadas", () => {
    const warn = vi.fn();
    const logger = { warn } as unknown as LoggerPort;
    const first = reportPersonaV2ToolError(new Error("SELECT password=secret"), logger);
    const second = reportPersonaV2ToolError(new Error("secret"), logger);
    expect(first.supportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.supportId).not.toBe(first.supportId);
    expect(warn.mock.calls[0]).toEqual([
      "persona-v2 tool failed",
      {
        supportId: first.supportId,
        code: "CAPABILITY_UNAVAILABLE",
        source: undefined,
        stage: undefined,
        details: undefined,
      },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|SELECT/);
  });
});
