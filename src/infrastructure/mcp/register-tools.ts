import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/env.js";
import type { AdicionarRelacionamento } from "../../application/use-cases/adicionar-relacionamento.js";
import type { AnotarFonte } from "../../application/use-cases/anotar-fonte.js";
import type { AtualizarFonte } from "../../application/use-cases/atualizar-fonte.js";
import type { BuscarContexto } from "../../application/use-cases/buscar-contexto.js";
import type { ConsultarDados } from "../../application/use-cases/consultar-dados.js";
import type { DesconectarAmbiente } from "../../application/use-cases/desconectar-ambiente.js";
import type { DescreverTabela } from "../../application/use-cases/descrever-tabela.js";
import type { ExplorarTabelas } from "../../application/use-cases/explorar-tabelas.js";
import type { ListarAmbientes } from "../../application/use-cases/listar-ambientes.js";
import type { ListarAnotacoes } from "../../application/use-cases/listar-anotacoes.js";
import type { ListarFontes } from "../../application/use-cases/listar-fontes.js";
import type { ObterFonte } from "../../application/use-cases/obter-fonte.js";
import type { RegistrarFonte } from "../../application/use-cases/registrar-fonte.js";
import type { RemoverAnotacao } from "../../application/use-cases/remover-anotacao.js";
import type { RemoverFonte } from "../../application/use-cases/remover-fonte.js";
import type { SalvarConsulta } from "../../application/use-cases/salvar-consulta.js";
import type { TestarSql } from "../../application/use-cases/testar-sql.js";
import type { ConectarAmbiente } from "../../application/use-cases/conectar-ambiente.js";
import type { ConfigurarClientToken } from "../../application/use-cases/configurar-client-token.js";
import type { VerificarStatusAmbiente } from "../../application/use-cases/verificar-status-ambiente.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { currentAccountId } from "./account-context.js";
import { mapConsultarDados, mapListarAnotacoes, mapObterFonte } from "./mappers.js";
import { createToolRunner } from "./tool-result.js";

export interface ToolUseCases {
  listarAmbientes: ListarAmbientes;
  conectarAmbiente: ConectarAmbiente;
  configurarClientToken: ConfigurarClientToken;
  verificarStatusAmbiente: VerificarStatusAmbiente;
  listarFontes: ListarFontes;
  obterFonte: ObterFonte;
  consultarDados: ConsultarDados;
  desconectarAmbiente: DesconectarAmbiente;
  registrarFonte: RegistrarFonte;
  atualizarFonte: AtualizarFonte;
  removerFonte: RemoverFonte;
  explorarTabelas: ExplorarTabelas;
  descreverTabela: DescreverTabela;
  testarSql: TestarSql;
  anotarFonte: AnotarFonte;
  adicionarRelacionamento: AdicionarRelacionamento;
  removerAnotacao: RemoverAnotacao;
  listarAnotacoes: ListarAnotacoes;
  salvarConsulta: SalvarConsulta;
  buscarContexto: BuscarContexto;
}

const emptyShape = {};

export const registerTools = (
  server: McpServer,
  config: AppConfig,
  useCases: ToolUseCases,
  logger: LoggerPort,
): void => {
  const runTool = createToolRunner(config, logger);

  server.tool(
    "listar_ambientes",
    "Lista os ambientes ERP já conectados à conta MCP autenticada (nome, dialeto, status de aprovação, se há client_token). Use antes de consultar dados. Não pede senha do plug-server.",
    emptyShape,
    async () =>
      runTool("listar_ambientes", () => useCases.listarAmbientes.execute(currentAccountId())),
  );

  server.tool(
    "conectar_ambiente",
    "Conecta um ambiente ERP. Solicite ao usuário: agentId (UUID do plug_agente), dialeto do banco (mssql|sybase|postgres|firebird) e um nome amigável. NÃO peça e-mail/senha do plug-server. O MCP usa um Client de serviço e abre pedido de acesso; o dono do agente precisa aprovar.",
    {
      agentId: z.string().optional().describe("UUID do agente no plug-server"),
      dialeto: z
        .enum(["mssql", "sybase", "postgres", "firebird"])
        .optional()
        .describe("Dialeto SQL do banco deste agente. Definido pelo usuário, nunca inferido."),
      nomeAmigavel: z.string().optional().describe("Nome para o usuário reconhecer o ambiente"),
    },
    async (args) =>
      runTool("conectar_ambiente", () =>
        useCases.conectarAmbiente.execute(currentAccountId(), {
          agentId: args.agentId,
          dialeto: args.dialeto,
          nomeAmigavel: args.nomeAmigavel,
        }),
      ),
  );

  server.tool(
    "configurar_client_token",
    "Grava o client_token de autorização SQL do ambiente. Peça o token ao administrador do ERP (não é senha do plug-server nem do banco). O valor não deve ser repetido na resposta ao usuário.",
    {
      ambienteId: z
        .string()
        .optional()
        .describe("id retornado por listar_ambientes / conectar_ambiente"),
      clientToken: z.string().optional().describe("Token opaco de até 512 caracteres"),
    },
    async (args) =>
      runTool("configurar_client_token", () =>
        useCases.configurarClientToken.execute(currentAccountId(), {
          ambienteId: args.ambienteId,
          clientToken: args.clientToken,
        }),
      ),
  );

  server.tool(
    "verificar_status_ambiente",
    "Consulta no plug-server se o acesso ao agente foi aprovado e se há client_token. Se pending, oriente o usuário a aguardar aprovação do dono do agente. Não execute consultar_dados enquanto pending.",
    {
      ambienteId: z.string().optional(),
    },
    async (args) =>
      runTool("verificar_status_ambiente", () =>
        useCases.verificarStatusAmbiente.execute(currentAccountId(), args.ambienteId),
      ),
  );

  server.tool(
    "listar_fontes",
    "Lista fontes do catálogo (seed + as desta conta/agente) com origem seed|minha. Use o id em obter_fonte. Se o usuário pedir um assunto que não está na lista, não invente SQL permanente: explorar_tabelas → descrever_tabela → testar_sql (ler amostra e códigos) → registrar_fonte. Só origem=minha pode ser atualizada ou removida.",
    {
      ambienteId: z.string().optional(),
    },
    async (args) =>
      runTool("listar_fontes", () =>
        useCases.listarFontes.execute(currentAccountId(), args.ambienteId),
      ),
  );

  server.tool(
    "obter_fonte",
    "Devolve SQL base no dialeto do ambiente, colunas, regras completas (nome/descricao/expressao), sinonimos com descricao, relacionamentos (fonte ou tabela crua), anotacoes deste agentId e orientacoes_ia (notas de uso/preferencia + dicas estáticas). Monte consultar_dados a partir de sql_base. origem=minha: edite com atualizar_fonte ou anotar_fonte. origem=seed: sombra via registrar_fonte.",
    {
      ambienteId: z.string().optional(),
      fonteId: z.string().optional().describe("slug da fonte, ex.: vendas"),
    },
    async (args) =>
      runTool("obter_fonte", async () =>
        mapObterFonte(
          await useCases.obterFonte.execute(currentAccountId(), {
            ambienteId: args.ambienteId,
            fonteId: args.fonteId,
          }),
        ),
      ),
  );

  const colunaShape = z.object({
    nome: z.string().optional(),
    tipo: z.string().optional(),
    descricao: z
      .string()
      .optional()
      .describe("Significado de negócio informado pelo usuário, nunca inventado"),
    regraNegocio: z
      .string()
      .optional()
      .describe(
        "Dicionário informado pelo usuário, nunca inventado (ex.: Status A=Aberto; P=Pago; C=Cancelado)",
      ),
  });
  const definicaoFonteShape = {
    ambienteId: z.string().optional(),
    slug: z.string().optional().describe("id da fonte, minúsculas, ex.: contas_pagar"),
    nome: z.string().optional(),
    descricao: z
      .string()
      .optional()
      .describe("O que a consulta responde; aparece em listar_fontes"),
    sqlBase: z
      .string()
      .optional()
      .describe("SELECT com FROM de tabela real, no dialeto do ambiente"),
    observacoesDialeto: z.string().optional(),
    confirmado: z
      .boolean()
      .optional()
      .describe(
        "true só depois de testar_sql, o usuário explicar códigos (Status etc.) e concordar com o resumo",
      ),
    colunas: z.array(colunaShape).optional(),
    regras: z
      .array(
        z.object({
          nome: z.string().optional(),
          descricao: z
            .string()
            .optional()
            .describe("Restrição ou dicionário de código dito pelo usuário, nunca inventado"),
          expressao: z.string().optional(),
        }),
      )
      .optional(),
    sinonimos: z
      .array(z.object({ termo: z.string().optional(), descricao: z.string().optional() }))
      .optional(),
    relacionamentos: z
      .array(
        z.object({
          colunaOrigem: z.string().optional(),
          fonteDestinoSlug: z.string().optional(),
          tabelaDestino: z
            .string()
            .optional()
            .describe("Tabela crua do ERP quando o destino ainda não é uma fonte"),
          colunaDestino: z.string().optional(),
          tipoJoin: z.string().optional(),
          descricao: z.string().optional(),
        }),
      )
      .optional(),
  };

  server.tool(
    "explorar_tabelas",
    "Lista tabelas e views do ERP (catálogo de sistema) neste ambiente. Use quando o usuário pedir uma consulta que ainda não existe em listar_fontes e não trouxe SQL. Depois: descrever_tabela → testar_sql (ler amostra e códigos) → registrar_fonte. O significado de negócio vem do usuário. Se PERMISSION_DENIED, peça os nomes das tabelas ao usuário.",
    {
      ambienteId: z.string().optional(),
      filtro: z.string().optional().describe("Trecho do nome da tabela, ex.: venda"),
    },
    async (args) =>
      runTool("explorar_tabelas", () =>
        useCases.explorarTabelas.execute(currentAccountId(), {
          ambienteId: args.ambienteId,
          filtro: args.filtro,
        }),
      ),
  );

  server.tool(
    "descrever_tabela",
    "Devolve colunas, tipos SQL e nulabilidade de uma tabela/view do ERP. Use após explorar_tabelas. Tipo SQL não explica códigos (Status='A'); isso só o usuário e a amostra de testar_sql explicam. Não invente semântica.",
    {
      ambienteId: z.string().optional(),
      tabela: z.string().optional().describe("Nome da tabela, opcionalmente schema.tabela"),
    },
    async (args) =>
      runTool("descrever_tabela", () =>
        useCases.descreverTabela.execute(currentAccountId(), {
          ambienteId: args.ambienteId,
          tabela: args.tabela,
        }),
      ),
  );

  server.tool(
    "testar_sql",
    "Executa o SQL no ERP (até 20 linhas) para validar e para a IA ler estrutura: tipoInferido, sampleRows, colunasCodigo. Use ANTES de registrar_fonte. Mostre amostra ao usuário; se Status vier como letra, pergunte o dicionário. Não substitui consultar_dados.",
    {
      ambienteId: z.string().optional(),
      sql: z.string().optional().describe("SELECT com FROM de tabela real, no dialeto do ambiente"),
    },
    async (args) =>
      runTool("testar_sql", () =>
        useCases.testarSql.execute(currentAccountId(), {
          ambienteId: args.ambienteId,
          sql: args.sql,
        }),
      ),
  );

  server.tool(
    "registrar_fonte",
    "Registra uma consulta do usuário neste ambiente. Fluxo: testar_sql (ler tipos e códigos) → mostre amostra e pergunte significado/dicionário → reenvie com confirmado=true. Nunca invente semântica nem o que 'A'/'P' quer dizer. O dialeto sai do ambiente. Slug já da conta: use atualizar_fonte.",
    definicaoFonteShape,
    async (args) =>
      runTool("registrar_fonte", () => useCases.registrarFonte.execute(currentAccountId(), args)),
  );

  server.tool(
    "atualizar_fonte",
    "Substitui por completo uma fonte origem=minha. Chame obter_fonte, testar_sql se o SQL mudou (releia códigos), mostre o resumo e reenvie a definição completa com confirmado=true e dicionários em regraNegocio. Não edita o seed — sombra via registrar_fonte no mesmo slug.",
    definicaoFonteShape,
    async (args) =>
      runTool("atualizar_fonte", () => useCases.atualizarFonte.execute(currentAccountId(), args)),
  );

  server.tool(
    "remover_fonte",
    "Apaga uma fonte origem=minha deste agente. Confirme com o usuário antes. Se o slug existia no seed, a versão do seed volta a valer. Não remove fontes do seed.",
    {
      ambienteId: z.string().optional(),
      slug: z.string().optional().describe("id da fonte com origem=minha"),
    },
    async (args) =>
      runTool("remover_fonte", () =>
        useCases.removerFonte.execute(currentAccountId(), {
          ambienteId: args.ambienteId,
          slug: args.slug,
        }),
      ),
  );

  server.tool(
    "consultar_dados",
    "Executa SQL no ERP via plug-server (sql.execute) para responder a pergunta do usuário. Comece por buscar_contexto neste agentId. Prefira uma fonte de listar_fontes; se o assunto for recorrente e não existir fonte, registre-a (testar_sql → registrar_fonte) em vez de SQL avulso permanente. Prefira SUM/COUNT/GROUP BY. Use params nomeados. options.max_rows default 500; se truncated=true o resultado está incompleto. Leia error.hint. Depois da resposta: se o usuário confirmar, salvar_consulta; se ensinar regra, código ou join, anotar_fonte — a base deste agentId evolui a cada turno.",
    {
      ambienteId: z.string().optional(),
      sql: z
        .string()
        .optional()
        .describe("SQL derivado do sql_base da fonte, no dialeto do ambiente"),
      params: z
        .record(z.unknown())
        .optional()
        .describe("Parâmetros nomeados, ex. { dataInicio: '2026-08-01' }"),
      options: z
        .object({
          max_rows: z.number().int().positive().optional(),
          page: z.number().int().positive().optional(),
          page_size: z.number().int().positive().optional(),
          timeout_ms: z.number().int().positive().optional(),
        })
        .optional(),
    },
    async (args) =>
      runTool("consultar_dados", async () =>
        mapConsultarDados(
          await useCases.consultarDados.execute(currentAccountId(), {
            ambienteId: args.ambienteId,
            sql: args.sql,
            params: args.params,
            options: args.options,
          }),
        ),
      ),
  );

  server.tool(
    "buscar_contexto",
    "Primeira tool numa pergunta de dados: busca fontes, anotações, relacionamentos e consultas já aprovadas neste agentId. Não cruza bancos. Depois: obter_fonte nas candidatas e consultar_dados. Use o que achar para não perder o que o usuário já ensinou.",
    {
      ambienteId: z.string().optional(),
      pergunta: z.string().optional().describe("Pergunta do usuário em linguagem natural"),
      limite: z.number().int().positive().optional(),
    },
    async (args) =>
      runTool("buscar_contexto", () => useCases.buscarContexto.execute(currentAccountId(), args)),
  );

  server.tool(
    "anotar_fonte",
    "Grava uma nota incremental deste agentId (texto do usuário, nunca inventado). Use sempre que o usuário ensinar significado, dicionário, filtro ou preferência — a base evolui a cada correção. Sem fonteId vira glossário daquele banco. Para um join, use adicionar_relacionamento. Não dispara dry run.",
    {
      ambienteId: z.string().optional(),
      fonteId: z.string().optional().describe("slug da fonte; omita para glossário do agente"),
      tipo: z
        .enum(["uso", "codigo", "alerta", "glossario", "preferencia"])
        .optional()
        .describe("uso/preferencia entram em orientacoes_ia"),
      titulo: z.string().optional(),
      texto: z.string().optional().describe("Nota dita pelo usuário"),
    },
    async (args) =>
      runTool("anotar_fonte", () => useCases.anotarFonte.execute(currentAccountId(), args)),
  );

  server.tool(
    "adicionar_relacionamento",
    "Acrescenta um join incremental numa fonte origem=minha deste agentId. Use quando o usuário ensinar um cruzamento (fonteDestinoSlug ou tabelaDestino, nunca os dois). Fonte seed: FONTE_READONLY — registre uma sombra com registrar_fonte. Não dispara dry run.",
    {
      ambienteId: z.string().optional(),
      fonteId: z.string().optional().describe("slug da fonte origem"),
      relacionamento: z
        .object({
          colunaOrigem: z.string().optional(),
          fonteDestinoSlug: z.string().optional(),
          tabelaDestino: z.string().optional(),
          colunaDestino: z.string().optional(),
          tipoJoin: z.string().optional(),
          descricao: z.string().optional(),
        })
        .optional(),
    },
    async (args) =>
      runTool("adicionar_relacionamento", () =>
        useCases.adicionarRelacionamento.execute(currentAccountId(), args),
      ),
  );

  server.tool(
    "remover_anotacao",
    "Remove uma anotação deste agentId. Confirme com o usuário. Não apaga a fonte.",
    {
      ambienteId: z.string().optional(),
      anotacaoId: z.string().optional().describe("id devolvido por anotar_fonte / obter_fonte"),
    },
    async (args) =>
      runTool("remover_anotacao", () => useCases.removerAnotacao.execute(currentAccountId(), args)),
  );

  server.tool(
    "listar_anotacoes",
    "Lista o glossário e as anotações deste agentId sem precisar de um texto de busca. Com fonteId, lista só as notas daquela fonte (sem o glossário). Sem fonteId, lista tudo (glossário + notas de qualquer fonte, com o slug de cada uma). Use para revisar o que já foi ensinado antes de perguntar de novo ao usuário.",
    {
      ambienteId: z.string().optional(),
      fonteId: z.string().optional().describe("slug da fonte; omita para listar tudo deste agente"),
      limite: z.number().int().positive().optional(),
    },
    async (args) =>
      runTool("listar_anotacoes", async () =>
        mapListarAnotacoes(await useCases.listarAnotacoes.execute(currentAccountId(), args)),
      ),
  );

  server.tool(
    "salvar_consulta",
    "Só depois de o usuário confirmar que a resposta estava certa. Grava pergunta + SQL (sem linhas de resultado) neste agentId para reuso via buscar_contexto. Faça isso de rotina: consulta aprovada que não foi salva se perde na próxima sessão.",
    {
      ambienteId: z.string().optional(),
      pergunta: z.string().optional().describe("Pergunta em linguagem natural"),
      sql: z.string().optional().describe("SQL que funcionou, com FROM de tabela real"),
      fonteId: z.string().optional().describe("slug da fonte usada, se houver"),
      observacao: z.string().optional().describe("Correção ou dica dita pelo usuário"),
    },
    async (args) =>
      runTool("salvar_consulta", () => useCases.salvarConsulta.execute(currentAccountId(), args)),
  );

  server.tool(
    "desconectar_ambiente",
    "Remove o ambiente da conta MCP e tenta revogar o client_token no plug-server. Confirme com o usuário antes: a ação apaga o ambiente local (o histórico de auditoria permanece). Depois será preciso conectar_ambiente de novo.",
    {
      ambienteId: z.string().optional().describe("id retornado por listar_ambientes"),
    },
    async (args) =>
      runTool("desconectar_ambiente", () =>
        useCases.desconectarAmbiente.execute(currentAccountId(), args.ambienteId),
      ),
  );
};
