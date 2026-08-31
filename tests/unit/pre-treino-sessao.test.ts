import { describe, expect, it } from "vitest";
import {
  PRE_TREINO_SESSAO,
  MCP_SERVER_INSTRUCTIONS,
} from "../../src/infrastructure/mcp/server-instructions.js";

describe("PRE_TREINO_SESSAO", () => {
  it("define consultor, SQL no escopo, cruzamento e listar_skills", () => {
    expect(PRE_TREINO_SESSAO).toMatch(/consultor/i);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o invente tabela/i);
    expect(PRE_TREINO_SESSAO).toMatch(/escopo/i);
    expect(PRE_TREINO_SESSAO).toMatch(/validar_consulta/);
    expect(PRE_TREINO_SESSAO).toContain("SKILL_GAP");
    expect(PRE_TREINO_SESSAO).toContain("listar_skills");
    expect(PRE_TREINO_SESSAO).toMatch(/Aprendizado constante/i);
    expect(PRE_TREINO_SESSAO).toContain("registrar_aprendizado");
    expect(PRE_TREINO_SESSAO).toContain("consultar_dados");
    expect(PRE_TREINO_SESSAO).toContain(":nome");
    expect(PRE_TREINO_SESSAO).toContain(":empresa");
    expect(PRE_TREINO_SESSAO).toContain("options.page");
    expect(PRE_TREINO_SESSAO).toContain("page_size");
    expect(PRE_TREINO_SESSAO).toContain("CONSULTA_SEM_RECORTE");
    expect(PRE_TREINO_SESSAO).toContain("truncated");
    expect(PRE_TREINO_SESSAO).toContain("hasNextPage");
    expect(PRE_TREINO_SESSAO).toContain("LITERAL_TEXTO");
    expect(PRE_TREINO_SESSAO).toMatch(/inspecionar_consulta sem sql/i);
    expect(PRE_TREINO_SESSAO).toMatch(/Aceita skill validada/i);
    expect(PRE_TREINO_SESSAO).toContain("listar_conflitos");
    expect(PRE_TREINO_SESSAO).toContain("conhecimentos[]");
    expect(PRE_TREINO_SESSAO).toMatch(/FTS\/ILIKE/);
    expect(PRE_TREINO_SESSAO).toMatch(/não embeddings\/RAG/);
    expect(PRE_TREINO_SESSAO).toMatch(/stem une inflexão/);
    expect(PRE_TREINO_SESSAO).toContain("consultasExemplo");
    expect(PRE_TREINO_SESSAO).toContain("consultasAprendidas[].id");
    expect(PRE_TREINO_SESSAO).toContain("consultaSemanticaSugerida");
    expect(PRE_TREINO_SESSAO).toMatch(/maior overlap/);
    expect(PRE_TREINO_SESSAO).toContain("pacoteMinimo");
    expect(PRE_TREINO_SESSAO).toMatch(/tipo=sinonimo/);
    expect(PRE_TREINO_SESSAO).toMatch(/consultaPermitida/);
    expect(PRE_TREINO_SESSAO).toContain("guia://paginacao");
    expect(PRE_TREINO_SESSAO).toContain("skill://");
    expect(PRE_TREINO_SESSAO).toMatch(/IN \(:nome\)/);
  });

  it("entra em MCP_SERVER_INSTRUCTIONS junto com a operação", () => {
    expect(MCP_SERVER_INSTRUCTIONS.startsWith(PRE_TREINO_SESSAO)).toBe(true);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("registrar_acesso");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("consultar_dados");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("despublicar_skill");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("metricasSaida");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("rascunho_revalidacao");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("remover_relacionamento");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("resumoPublicacao");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("listar_conflitos");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("consultaSemanticaSugerida");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("Pacote mínimo");
  });
});
