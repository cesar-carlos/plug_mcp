import { createHash } from "node:crypto";
import type { PluginRuntime } from "./package-schemas.js";

/** Training tools are discovered only with the corresponding delegated authority. */
export const PLUGIN_DELEGATED_TRAINING_TOOLS = [
  "listar_rascunhos",
  "criar_rascunho_skill",
  "editar_rascunho_skill",
  "obter_testes_skill",
  "editar_caso_skill",
  "obter_template_treinamento",
  "criar_rascunho_de_template",
  "revisar_publicacao_skill",
  "publicar_skill",
] as const;

/** Minimum surface used by the packaged skills; integration tests compare it to tools/list. */
export const PLUGIN_TOOL_CATALOG: Readonly<Record<PluginRuntime, readonly string[]>> = {
  legacy: [
    "get_profile",
    "obter_contexto_sessao",
    "buscar_contexto",
    "obter_skill",
    "consultar_dados",
    "exportar_anexo",
    "treinar_com_sql",
    "criar_skill",
    "validar_skill",
    "salvar_consulta",
    "revogar_conexao_chatgpt",
  ],
  "persona-v2": [
    "obter_contexto_persona",
    "obter_treinamento_base",
    "diagnosticar_permissoes",
    "reportar_erro_interacao",
    "listar_fontes",
    "listar_skills",
    "listar_padroes",
    "obter_padrao",
    "obter_grafo_conhecimento",
    "obter_capacidades",
    "verificar_fonte",
    "buscar_contexto",
    "obter_skill",
    "validar_consulta",
    "consultar_dados",
    "criar_anexo_consulta",
    "obter_anexo",
    "validar_cruzamento",
    "executar_cruzamento",
    "preparar_operacao",
    "executar_operacao",
    "obter_operacao",
    "cancelar_operacao",
    "conciliar_operacao",
    "iniciar_cadastro_fonte",
    "iniciar_rotacao_credenciais_fonte",
    "iniciar_rotacao_token_persona",
    "iniciar_emissao_token_persona",
    "iniciar_cadastro_integracao",
    "iniciar_rotacao_credenciais_integracao",
    "listar_operacoes_externas",
    "consultar_integracao",
    "preparar_acao_externa",
    "executar_acao_externa",
    "obter_acao_externa",
    "cancelar_acao_externa",
    "conciliar_acao_externa",
    ...PLUGIN_DELEGATED_TRAINING_TOOLS,
  ],
};
export const pluginTools = (
  runtime: PluginRuntime,
  variant: "chatgpt" | "portable" = "portable",
): readonly string[] =>
  runtime === "persona-v2" && variant === "chatgpt"
    ? [...PLUGIN_TOOL_CATALOG[runtime], "get_profile", "revogar_conexao_chatgpt"]
    : PLUGIN_TOOL_CATALOG[runtime];
export const pluginToolCatalogHash = (
  runtime: PluginRuntime,
  variant: "chatgpt" | "portable" = "portable",
): string =>
  createHash("sha256")
    .update(JSON.stringify([...pluginTools(runtime, variant)].sort()))
    .digest("hex");
export const pluginResource = (
  origin: string,
  runtime: PluginRuntime,
  variant: "chatgpt" | "portable",
): string =>
  `${origin}${runtime === "persona-v2" && variant === "portable" ? "/mcp" : "/mcp/chatgpt"}`;

export const assertPluginToolsAvailable = (
  runtime: PluginRuntime,
  tools: readonly string[],
  variant: "chatgpt" | "portable" = "portable",
): void => {
  const conditional =
    runtime === "persona-v2"
      ? [
          ...PLUGIN_DELEGATED_TRAINING_TOOLS,
          "iniciar_cadastro_fonte",
          "iniciar_rotacao_credenciais_fonte",
          "iniciar_rotacao_token_persona",
          "iniciar_emissao_token_persona",
          "iniciar_cadastro_integracao",
          "iniciar_rotacao_credenciais_integracao",
        ]
      : [];
  if (
    pluginTools(runtime, variant).some(
      (name) => !conditional.includes(name) && !tools.includes(name),
    )
  ) {
    throw new Error("Catálogo MCP incompatível com as skills desta geração.");
  }
};
