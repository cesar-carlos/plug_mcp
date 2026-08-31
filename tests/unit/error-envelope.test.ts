import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import {
  ERROR_MAPPING_DOC_PATH,
  absoluteErrorMappingUrl,
} from "../../src/domain/errors/error-next-action.js";
import { requireAcessoAprovado } from "../../src/application/use-cases/shared/guards.js";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";
import { errorResult } from "../../src/infrastructure/mcp/tool-result.js";
import { testConfig } from "../../src/config/env.js";
import type { Acesso } from "../../src/domain/entities/acesso.js";

const acesso = (statusAcesso: Acesso["statusAcesso"]): Acesso => ({
  id: "a",
  usuarioId: "u",
  agentId: "11111111-1111-4111-8111-111111111111",
  dialeto: "sybase",
  nomeAmigavel: "t",
  clientTokenEnc: "x",
  clientTokenHash: "y",
  statusAcesso,
  escopoPadrao: null,
  timezone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("envelope de erro", () => {
  it("toJson preenche category, nextAction e documentationUrl", () => {
    const json = new DomainError({
      code: ERROR_CODES.SKILL_GAP,
      message: "gap",
      hint: "listar_skills",
    }).toJson();
    expect(json.error.category).toBe("scope");
    expect(json.error.nextAction).toBe("listar_skills");
    expect(json.error.documentationUrl).toBe(`${ERROR_MAPPING_DOC_PATH}#skill_gap`);
    expect(absoluteErrorMappingUrl("https://mcp.example", json.error.documentationUrl ?? "")).toBe(
      "https://mcp.example/docs/mcp/error-mapping.md#skill_gap",
    );
  });

  it("ACCESS_REVOKED do cofre aponta verificar_acesso", () => {
    expect(() => requireAcessoAprovado(acesso("revoked"))).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.ACCESS_REVOKED,
        source: "client_agent_access",
      }),
    );
    try {
      requireAcessoAprovado(acesso("revoked"));
    } catch (error) {
      const json = (error as DomainError).toJson();
      expect(json.error.nextAction).toBe("verificar_acesso");
      expect(json.error.source).toBe("client_agent_access");
    }
  });

  it("ACCESS_REVOKED do RPC aponta atualizar_credencial_plug", () => {
    const err = mapPlugServerFailure(
      {
        status: 200,
        body: { response: { item: { error: { code: -32002, message: "revoked" } } } },
      },
      undefined,
      "sql.execute",
    );
    expect(err.code).toBe(ERROR_CODES.ACCESS_REVOKED);
    expect(err.source).toBe("client_token_rpc");
    expect(err.stage).toBe("sql.execute");
    expect(err.retryable).toBe(false);
    expect(err.toJson().error.nextAction).toBe("atualizar_credencial_plug");
  });

  it("errorResult expõe nextAction no payload da tool", () => {
    const result = errorResult(
      new DomainError({
        code: ERROR_CODES.PRIVACIDADE_NEGADA,
        message: "pii",
        hint: "agregar",
      }),
      testConfig(),
    );
    const payload = JSON.parse(result.content[0]!.text) as {
      error: { nextAction: string; category: string; documentationUrl: string };
    };
    expect(payload.error.nextAction).toBe("inspecionar_consulta");
    expect(payload.error.category).toBe("privacy");
    expect(payload.error.documentationUrl).toBe(
      `${testConfig().PUBLIC_BASE_URL}${ERROR_MAPPING_DOC_PATH}#privacidade_negada`,
    );
  });

  it("TABELA_FORA_DO_ESCOPO do treino aponta explorar_tabelas", () => {
    const json = new DomainError({
      code: ERROR_CODES.TABELA_FORA_DO_ESCOPO,
      message: "fora",
      hint: "explorar",
      source: "mcp",
      stage: "descobrir_tabela",
    }).toJson();
    expect(json.error.category).toBe("scope");
    expect(json.error.nextAction).toBe("explorar_tabelas");
    expect(json.error.documentationUrl).toMatch(/#tabela_fora_do_escopo/);
  });

  it("TABELA_FORA_DO_ESCOPO do SQL aponta obter_skill", () => {
    const json = new DomainError({
      code: ERROR_CODES.TABELA_FORA_DO_ESCOPO,
      message: "fora",
      hint: "pacote",
      source: "sql",
    }).toJson();
    expect(json.error.nextAction).toBe("obter_skill");
  });
});
