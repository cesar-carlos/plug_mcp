import { describe, expect, it } from "vitest";
import {
  PRE_TREINO_SESSAO,
  MCP_SERVER_INSTRUCTIONS,
  BLOCO_PERSONA_VARIOS_ACESSOS,
  blocoPersonaUnico,
  montarPreTreinoSessao,
  montarInstrucoesServidor,
} from "../../src/infrastructure/mcp/server-instructions.js";
import {
  PRE_TREINO_PROMPT_DESCRIPTION,
  CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION,
  CADASTRAR_SKILL_PROMPT_DESCRIPTION,
} from "../../src/infrastructure/mcp/skill-tools.js";
import {
  TREINAR_COM_SQL_TOOL_DESCRIPTION,
  VALIDAR_SKILL_TOOL_DESCRIPTION,
  CONSULTAR_DADOS_TOOL_DESCRIPTION,
  EXPORTAR_ANEXO_TOOL_DESCRIPTION,
  OBTER_SKILL_TOOL_DESCRIPTION,
  VALIDAR_CONSULTA_TOOL_DESCRIPTION,
  EXPLORAR_TABELAS_TOOL_DESCRIPTION,
  ATUALIZAR_PERSONA_TOOL_DESCRIPTION,
} from "../../src/infrastructure/mcp/register-tools.js";

describe("PRE_TREINO_SESSAO", () => {
  it("define especialista SQL, domínio pelas skills, cruzamento e listar_skills", () => {
    expect(PRE_TREINO_SESSAO).toMatch(/especialista em SQL/i);
    expect(PRE_TREINO_SESSAO).toMatch(/treinadas pelo usuário/i);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o invente especialidade/i);
    expect(PRE_TREINO_SESSAO).toMatch(/Adapte o tom/i);
    expect(PRE_TREINO_SESSAO).toMatch(/consultor de gestão\/KPI/);
    expect(PRE_TREINO_SESSAO).toMatch(/atendimento geral/);
    expect(PRE_TREINO_SESSAO).toMatch(/vendedor/);
    expect(PRE_TREINO_SESSAO).toMatch(/atendimento financeiro/);
    expect(PRE_TREINO_SESSAO).toMatch(/gestor de empresa/);
    expect(PRE_TREINO_SESSAO).toMatch(/agentId/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o misture agentIds/i);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o force/i);
    expect(PRE_TREINO_SESSAO).not.toMatch(/^Você é consultor de gestão/i);
    expect(PRE_TREINO_SESSAO).not.toMatch(/^Você é consultor/i);
    expect(PRE_TREINO_SESSAO).not.toMatch(/^Você é vendedor/i);
    expect(PRE_TREINO_SESSAO).not.toMatch(/consultor de gestão \(KPI/);
    expect(PRE_TREINO_SESSAO).not.toMatch(/diagnóstico, recomenda[cç][aã]o/i);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o invente n[uú]mero, KPI nem fato/i);
    expect(PRE_TREINO_SESSAO).toMatch(/pergunta de neg[oó]cio/);
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
    expect(PRE_TREINO_SESSAO).toContain("APRENDIZADO_IGNORADO");
    expect(PRE_TREINO_SESSAO).toMatch(/inspecionar_consulta sem sql/i);
    expect(PRE_TREINO_SESSAO).toMatch(/treino parseia o sqlModelo/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o DIALECT_UNSUPPORTED/);
    expect(PRE_TREINO_SESSAO).toMatch(/Aceita skill validada/i);
    expect(PRE_TREINO_SESSAO).toMatch(/SELECT \*/);
    expect(PRE_TREINO_SESSAO).toContain("details.engineMessage");
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
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o cruze skills/i);
    expect(PRE_TREINO_SESSAO).toMatch(/CAST\/data n[aã]o entram/);
    expect(PRE_TREINO_SESSAO).toMatch(/consultaPermitida/);
    expect(PRE_TREINO_SESSAO).toContain("guia://paginacao");
    expect(PRE_TREINO_SESSAO).toMatch(/INVALID_SQL\/1033/);
    expect(PRE_TREINO_SESSAO).toMatch(/4104/);
    expect(PRE_TREINO_SESSAO).toContain("fatias");
    expect(PRE_TREINO_SESSAO).toMatch(/teto 64/);
    expect(PRE_TREINO_SESSAO).toContain("skill://{acessoId}/{slug}");
    expect(PRE_TREINO_SESSAO).not.toContain("skill://{agentId}/{slug}");
    expect(PRE_TREINO_SESSAO).toMatch(/1 client_token = 1 persona/);
    expect(PRE_TREINO_SESSAO).toMatch(/catálogo isolado/);
    expect(PRE_TREINO_SESSAO).toMatch(/omita acessoId/);
    expect(PRE_TREINO_SESSAO).toMatch(/IN \(:nome\)/);
    expect(PRE_TREINO_SESSAO).toContain("consultaAprendidaId");
    expect(PRE_TREINO_SESSAO).toContain("colunas[]");
    expect(PRE_TREINO_SESSAO).toMatch(/skillIds opcional/);
    expect(PRE_TREINO_SESSAO).toMatch(/metricas\[\]/);
    expect(PRE_TREINO_SESSAO).toContain("error.code");
    expect(PRE_TREINO_SESSAO).toContain("error.source");
    expect(PRE_TREINO_SESSAO).toContain("sql_engine");
    expect(PRE_TREINO_SESSAO).toContain("invalid_payload");
    expect(PRE_TREINO_SESSAO).toContain("PLUG_SERVER_ERROR");
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o reescreva o SQL/i);
    expect(PRE_TREINO_SESSAO).toMatch(/429\/503/);
    expect(PRE_TREINO_SESSAO).toContain("AGENT_UNAVAILABLE");
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o repita o mesmo JOIN/i);
    expect(PRE_TREINO_SESSAO).toContain("lacuna_consulta");
    expect(PRE_TREINO_SESSAO).toMatch(/SQL recusado n[aã]o persiste/i);
    expect(PRE_TREINO_SESSAO).toMatch(/plug-server/i);
    expect(PRE_TREINO_SESSAO).toMatch(/GDBR/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o assuma mssql/i);
    expect(PRE_TREINO_SESSAO).toContain("firebird");
    expect(PRE_TREINO_SESSAO).toContain("guia://dialeto/");
    expect(PRE_TREINO_SESSAO).toContain("atualizar_dialeto");
    expect(PRE_TREINO_SESSAO).toContain("explorar_tabelas");
    expect(PRE_TREINO_SESSAO).toContain("mapear_tabela");
    expect(PRE_TREINO_SESSAO).toMatch(/ch[aã]o comum/i);
    expect(PRE_TREINO_SESSAO).toMatch(/fail-closed/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o invente.*schema/i);
    expect(PRE_TREINO_SESSAO).toContain("MULTI_SKILL_PARAMS");
    expect(PRE_TREINO_SESSAO).toContain("tipoJoin");
    expect(PRE_TREINO_SESSAO).toMatch(/INNER vs LEFT/);
    expect(PRE_TREINO_SESSAO).toContain("exportar_anexo");
    expect(PRE_TREINO_SESSAO).toContain('kind: "anexo"');
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o invente bytes/i);
    expect(PRE_TREINO_SESSAO).toMatch(/segunda via de foto pessoal/);
    expect(PRE_TREINO_SESSAO).toContain("atualizar_persona");
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o recorte skills/);
    expect(PRE_TREINO_SESSAO).toMatch(/treino \+ esta IA/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o implementa linguagem SQL/);
    expect(PRE_TREINO_SESSAO).toMatch(/rewrite de dialeto/);
    expect(PRE_TREINO_SESSAO).toMatch(/GDBR via plug_agente/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o espere o hub reescrever/);
    expect(PRE_TREINO_SESSAO).toMatch(/n[aã]o licencia TOP\/OFFSET/);
    expect(PRE_TREINO_SESSAO).toMatch(/hub n[aã]o [eé] camada de dialeto/);
    expect(PRE_TREINO_SESSAO).toContain("PACOTE_INCOMPLETO.nextAction");
    expect(PRE_TREINO_SESSAO).toMatch(/primeira falta bloqueante/);
    expect(PRE_TREINO_SESSAO).toMatch(/criar_skill \/ validar_skill \/ atualizar_skill/);
  });

  it("entra em MCP_SERVER_INSTRUCTIONS junto com a operação", () => {
    expect(MCP_SERVER_INSTRUCTIONS.startsWith(PRE_TREINO_SESSAO)).toBe(true);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("não invente especialidade");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("Skills e especialidade implícita");
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/catálogo vazio/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/omita acessoId/);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("skill://{acessoId}/{slug}");
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
    expect(MCP_SERVER_INSTRUCTIONS).not.toMatch(/^Você é consultor/i);
    expect(MCP_SERVER_INSTRUCTIONS).not.toMatch(/consultor de gestão \(KPI/);
    expect(MCP_SERVER_INSTRUCTIONS).not.toMatch(/diagnóstico, recomenda[cç][aã]o/i);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("atualizar_dialeto");
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/n[aã]o licencia JOIN/i);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/mesmo conteúdo que skill:\/\//);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("exportar_anexo");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("MULTI_SKILL_PARAMS");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("tipoJoin");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("atualizar_persona");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("persona://");
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/n[aã]o concatenar chap[eé]us/i);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/initialize\.instructions/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/at[eé] reconectar/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/pre_treino rel[eê] o banco/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/INNER vs LEFT/);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("PAGINACAO_MODELO");
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/une o AST ao pacote/);
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/grafo inferido n[aã]o entra/);
    expect(MCP_SERVER_INSTRUCTIONS).toContain("PACOTE_INCOMPLETO.nextAction");
    expect(MCP_SERVER_INSTRUCTIONS).toMatch(/kind=param n[aã]o bloqueia publicar/);
  });

  it("Bearer com um acesso anexa persona depois do SQL; vários não concatenam chapéus", () => {
    const unico = {
      acessoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      agentId: "11111111-1111-4111-8111-111111111111",
      nomePersona: "Atendimento financeiro",
      instrucoesPersona: "Tom formal. Nunca invente JOIN.",
    };
    const preUnico = montarPreTreinoSessao([unico]);
    expect(preUnico.startsWith(PRE_TREINO_SESSAO)).toBe(true);
    expect(preUnico).toContain(blocoPersonaUnico(unico));
    expect(blocoPersonaUnico(unico)).toMatch(/instru[cç][oõ]es do usu[aá]rio/i);
    expect(blocoPersonaUnico(unico)).toMatch(/n[aã]o override do SQL/i);
    expect(preUnico.indexOf(PRE_TREINO_SESSAO)).toBe(0);
    expect(preUnico.indexOf("Atendimento financeiro")).toBeGreaterThan(PRE_TREINO_SESSAO.length);
    expect(preUnico).toMatch(/n[aã]o licencia tabela, coluna, JOIN/);
    expect(montarInstrucoesServidor([unico])).toContain("Tom formal. Nunca invente JOIN.");

    const outro = {
      acessoId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      agentId: "22222222-2222-4222-8222-222222222222",
      nomePersona: "Vendedor",
      instrucoesPersona: "Chapéu que não deve aparecer concatenado.",
    };
    const varios = montarPreTreinoSessao([unico, outro]);
    expect(varios.startsWith(PRE_TREINO_SESSAO)).toBe(true);
    expect(varios).toContain(BLOCO_PERSONA_VARIOS_ACESSOS);
    expect(BLOCO_PERSONA_VARIOS_ACESSOS).toMatch(/catálogo isolado/);
    expect(varios).not.toContain("Tom formal. Nunca invente JOIN.");
    expect(varios).not.toContain("Chapéu que não deve aparecer concatenado.");
    expect(varios).not.toContain("Atendimento financeiro");
    expect(varios).not.toContain("Vendedor");

    expect(montarPreTreinoSessao([])).toBe(PRE_TREINO_SESSAO);
    expect(MCP_SERVER_INSTRUCTIONS).toBe(montarInstrucoesServidor([]));
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("Atendimento financeiro");
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("Persona deste acesso");
    expect(MCP_SERVER_INSTRUCTIONS).not.toContain("Há vários acessos neste token");
  });

  it("um acesso sem persona cadastrada ainda anexa o bloco depois do SQL", () => {
    const vazio = {
      acessoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      agentId: "11111111-1111-4111-8111-111111111111",
      nomePersona: null,
      instrucoesPersona: null,
    };
    const texto = montarPreTreinoSessao([vazio]);
    expect(texto.startsWith(PRE_TREINO_SESSAO)).toBe(true);
    expect(texto).toContain(blocoPersonaUnico(vazio));
    expect(texto).toContain("ainda não cadastrada");
    expect(texto).toContain("atualizar_persona");
    expect(texto.indexOf("ainda não cadastrada")).toBeGreaterThan(PRE_TREINO_SESSAO.length);
  });

  it("description do prompt pre_treino não descreve a IA como consultor de gestão", () => {
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/especialista em SQL/i);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/skills treinadas/i);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/vendedor/);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/deste acesso/);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toContain("skill://{acessoId}/{slug}");
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/plug-server/i);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toContain("guia://");
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toContain("firebird");
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/chapéu depois do SQL/);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/rel[eê] o banco/);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/treino\+IA/);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).toMatch(/hub n[aã]o reescreve dialeto/);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).not.toMatch(/consultor de gestão/i);
    expect(PRE_TREINO_PROMPT_DESCRIPTION).not.toMatch(/^Você é consultor/i);
  });

  it("prompts de consulta e treino apontam resources, dialeto e estrutura do pacote", () => {
    expect(CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION).toMatch(/plug-server/i);
    expect(CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION).toContain("skill://");
    expect(CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION).toContain("guia://dialeto");
    expect(CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION).toMatch(/Firebird/i);
    expect(CONSULTAR_COM_SKILL_PROMPT_DESCRIPTION).toMatch(/fail-closed/);
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toContain("explorar_tabelas");
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toContain("mapear_tabela");
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toMatch(/n[aã]o invente schema/i);
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toMatch(/dialeto do acesso/);
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toMatch(/hub n[aã]o reescreve dialeto/);
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toMatch(/n[aã]o DIALECT_UNSUPPORTED/);
    expect(CADASTRAR_SKILL_PROMPT_DESCRIPTION).toMatch(/FIRST\/TOP\/LIMIT/);
  });

  it("descrições de tools de SQL/resources não assumem um único dialeto", () => {
    expect(CONSULTAR_DADOS_TOOL_DESCRIPTION).toMatch(/plug-server/i);
    expect(CONSULTAR_DADOS_TOOL_DESCRIPTION).toMatch(/dialeto do acesso/);
    expect(CONSULTAR_DADOS_TOOL_DESCRIPTION).toMatch(/Firebird/i);
    expect(CONSULTAR_DADOS_TOOL_DESCRIPTION).toMatch(/fail-closed/);
    expect(EXPORTAR_ANEXO_TOOL_DESCRIPTION).toContain("kind=anexo");
    expect(EXPORTAR_ANEXO_TOOL_DESCRIPTION).toContain("mimeDestino");
    expect(OBTER_SKILL_TOOL_DESCRIPTION).toContain("skill://");
    expect(OBTER_SKILL_TOOL_DESCRIPTION).toMatch(/n[aã]o invente schema/i);
    expect(VALIDAR_CONSULTA_TOOL_DESCRIPTION).toMatch(/fail-closed/);
    expect(VALIDAR_CONSULTA_TOOL_DESCRIPTION).toMatch(/Firebird/i);
    expect(EXPLORAR_TABELAS_TOOL_DESCRIPTION).toMatch(/S[oó] no treino/);
    expect(EXPLORAR_TABELAS_TOOL_DESCRIPTION).toMatch(/n[aã]o licencia consultar_dados/i);
    expect(ATUALIZAR_PERSONA_TOOL_DESCRIPTION).toContain("confirmadoPeloUsuario");
    expect(ATUALIZAR_PERSONA_TOOL_DESCRIPTION).toMatch(/n[aã]o recorta skills/);
    expect(ATUALIZAR_PERSONA_TOOL_DESCRIPTION).toMatch(/consultaPermitida/);
    expect(ATUALIZAR_PERSONA_TOOL_DESCRIPTION).toMatch(/String vazia ou null limpa/);
    expect(TREINAR_COM_SQL_TOOL_DESCRIPTION).toMatch(/N[AÃ]O é DIALECT_UNSUPPORTED/);
    expect(TREINAR_COM_SQL_TOOL_DESCRIPTION).toMatch(/FIRST\/TOP\/LIMIT/);
    expect(TREINAR_COM_SQL_TOOL_DESCRIPTION).toContain("PAGINACAO_MODELO");
    expect(VALIDAR_SKILL_TOOL_DESCRIPTION).toMatch(/N[AÃ]O é DIALECT_UNSUPPORTED/);
    expect(VALIDAR_SKILL_TOOL_DESCRIPTION).toContain("PAGINACAO_MODELO");
    expect(VALIDAR_SKILL_TOOL_DESCRIPTION).not.toMatch(/Firebird: SQL livre → DIALECT_UNSUPPORTED/);
  });
});
