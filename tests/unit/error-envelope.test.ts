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
  nomePersona: "Atendimento financeiro",
  instrucoesPersona: "Não invente JOIN.",
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

  it("QUERY_TIMEOUT do hub aponta agregar_ou_reduzir", () => {
    const err = mapPlugServerFailure({
      status: 200,
      body: { response: { item: { error: { code: -32008, message: "timeout" } } } },
    });
    expect(err.toJson().error.category).toBe("sql");
    expect(err.toJson().error.nextAction).toBe("agregar_ou_reduzir");
    expect(err.toJson().error.source).toBe("sql_engine");
  });

  it("withHint preserva source e stage do hub", () => {
    const json = new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "classificou",
      hint: "base",
      source: "sql_engine",
      stage: "sql.execute",
      details: { rpcCode: -32002 },
    })
      .withHint("tabelas: produto")
      .toJson();
    expect(json.error.hint).toBe("tabelas: produto");
    expect(json.error.source).toBe("sql_engine");
    expect(json.error.stage).toBe("sql.execute");
    expect(json.error.details).toEqual({ rpcCode: -32002 });
  });

  it("withHint preserva source sql do pacote", () => {
    const json = DomainError.pacote({
      code: ERROR_CODES.CONSULTA_SEM_RECORTE,
      message: "sem recorte",
      hint: "base",
    })
      .withHint("adicione WHERE")
      .toJson();
    expect(json.error.hint).toBe("adicione WHERE");
    expect(json.error.source).toBe("sql");
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
    expect(payload.error.nextAction).toBe("consultar_dados");
    expect(payload.error.nextAction).not.toBe("inspecionar_consulta");
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

  it("MULTI_SKILL_PARAMS aponta recorte_skillIds", () => {
    const json = new DomainError({
      code: ERROR_CODES.MULTI_SKILL_PARAMS,
      message: "conflito",
      hint: "recorte",
    }).toJson();
    expect(json.error.category).toBe("sql");
    expect(json.error.nextAction).toBe("recorte_skillIds");
    expect(json.error.documentationUrl).toMatch(/#multi_skill_params/);
  });

  it("JOIN_DESCONHECIDO aponta obter_skill, não confirmar_relacionamento", () => {
    const json = DomainError.pacote({
      code: ERROR_CODES.JOIN_DESCONHECIDO,
      message: "join",
      hint: "Só confirmar_relacionamento se o usuário ensinar o JOIN.",
    }).toJson();
    expect(json.error.category).toBe("scope");
    expect(json.error.source).toBe("sql");
    expect(json.error.nextAction).toBe("obter_skill");
    expect(json.error.nextAction).not.toBe("confirmar_relacionamento");
    expect(json.error.documentationUrl).toMatch(/#join_desconhecido/);
  });

  it("INVALID_SQL do pacote expõe source sql no envelope da tool", () => {
    const result = errorResult(
      DomainError.pacote({
        code: ERROR_CODES.INVALID_SQL,
        message: "SELECT * não é permitido.",
        hint: "Nomeie as colunas do dataset publicado.",
      }),
      testConfig(),
    );
    const payload = JSON.parse(result.content[0]!.text) as {
      error: { code: string; source?: string };
    };
    expect(payload.error.code).toBe(ERROR_CODES.INVALID_SQL);
    expect(payload.error.source).toBe("sql");
  });

  it("DIALECT_UNSUPPORTED aponta inspecionar_consulta sem sql", () => {
    const json = new DomainError({
      code: ERROR_CODES.DIALECT_UNSUPPORTED,
      message: "firebird",
      hint: "exemplo",
    }).toJson();
    expect(json.error.category).toBe("sql");
    expect(json.error.nextAction).toBe("inspecionar_consulta");
    expect(json.error.nextAction).not.toBe("consultar_dados");
    expect(json.error.documentationUrl).toMatch(/#dialect_unsupported/);
  });

  it("MIDIA_* usam source mcp, stage anexo e categoria de allowlist", () => {
    const tipo = DomainError.anexo({
      code: ERROR_CODES.MIDIA_TIPO_RECUSADO,
      message: "tipo",
      hint: "não",
    }).toJson().error;
    expect(tipo.source).toBe("mcp");
    expect(tipo.stage).toBe("anexo");
    expect(tipo.category).toBe("validation");
    expect(tipo.category).not.toBe("privacy");
    expect(tipo.nextAction).toBe("consultar_dados");
    expect(tipo.documentationUrl).toMatch(/#midia_tipo_recusado/);

    const origem = DomainError.anexo({
      code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
      message: "handle",
      hint: "consultar",
    }).toJson().error;
    expect(origem.source).toBe("mcp");
    expect(origem.stage).toBe("anexo");
    expect(origem.nextAction).toBe("consultar_dados");

    expect(
      DomainError.anexo({
        code: ERROR_CODES.MIDIA_TETO,
        message: "teto",
        hint: "reduzir",
        category: "budget",
      }).toJson().error,
    ).toMatchObject({ source: "mcp", stage: "anexo", category: "budget" });
  });

  it("CONSULTA_ORCAMENTO de anexo não aponta agregar_ou_reduzir", () => {
    const anexo = DomainError.anexo({
      code: ERROR_CODES.CONSULTA_ORCAMENTO,
      message: "anexo",
      hint: "recorte",
      category: "budget",
    }).toJson().error;
    expect(anexo.source).toBe("mcp");
    expect(anexo.stage).toBe("anexo");
    expect(anexo.nextAction).toBe("omitir_coluna_ou_reduzir");
    expect(anexo.nextAction).not.toBe("agregar_ou_reduzir");

    const skill = DomainError.pacote({
      code: ERROR_CODES.CONSULTA_ORCAMENTO,
      message: "max_rows",
      hint: "agregue",
    }).toJson().error;
    expect(skill.source).toBe("sql");
    expect(skill.nextAction).toBe("agregar_ou_reduzir");
  });
});
