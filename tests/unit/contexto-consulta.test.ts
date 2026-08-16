import { describe, expect, it } from "vitest";
import { AdicionarRelacionamento } from "../../src/application/use-cases/adicionar-relacionamento.js";
import { AnotarFonte } from "../../src/application/use-cases/anotar-fonte.js";
import { BuscarContexto } from "../../src/application/use-cases/buscar-contexto.js";
import { ConectarAmbiente } from "../../src/application/use-cases/conectar-ambiente.js";
import { ConfigurarClientToken } from "../../src/application/use-cases/configurar-client-token.js";
import { ListarAnotacoes } from "../../src/application/use-cases/listar-anotacoes.js";
import { ObterFonte } from "../../src/application/use-cases/obter-fonte.js";
import { RegistrarFonte } from "../../src/application/use-cases/registrar-fonte.js";
import { RemoverAnotacao } from "../../src/application/use-cases/remover-anotacao.js";
import { SalvarConsulta } from "../../src/application/use-cases/salvar-consulta.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import type { IndiceContextoPort } from "../../src/domain/ports/indice-contexto.port.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  InMemoryAmbienteRepository,
  InMemoryAnotacaoRepository,
  InMemoryAuditLog,
  InMemoryCatalogoRepository,
  InMemoryIndiceContexto,
  InMemoryMemoriaConsultaRepository,
} from "../../src/infrastructure/persistence/memory/memory-repos.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const AGENT_A = "3183a9f2-429b-46d6-a339-3580e5e5cb31";
const AGENT_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

const SQL_OK = "SELECT CodTitulo, Valor FROM TituloPagar WHERE Cancelado = 0";

const setupDoisAgentes = async () => {
  const ambientes = new InMemoryAmbienteRepository();
  const catalogo = new InMemoryCatalogoRepository();
  await catalogo.seedIfEmpty();
  const anotacoes = new InMemoryAnotacaoRepository();
  const memoria = new InMemoryMemoriaConsultaRepository();
  const indice = new InMemoryIndiceContexto(catalogo, anotacoes, memoria);
  const plug = new FakePlugServer();
  const audit = new InMemoryAuditLog();
  plug.approve(AGENT_A);
  plug.approve(AGENT_B);
  plug.sqlImpl = async () => ({
    columns: ["CodTitulo", "Valor"],
    rows: [{ CodTitulo: 1, Valor: 10 }],
  });
  const a = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
    agentId: AGENT_A,
    dialeto: "mssql",
    nomeAmigavel: "Banco A",
  });
  const b = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
    agentId: AGENT_B,
    dialeto: "mssql",
    nomeAmigavel: "Banco B",
  });
  await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
    ambienteId: a.ambiente.id,
    clientToken: "tok-a",
  });
  await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
    ambienteId: b.ambiente.id,
    clientToken: "tok-b",
  });
  return {
    ambientes,
    catalogo,
    anotacoes,
    memoria,
    indice,
    plug,
    audit,
    logger: new SilentTestLogger(),
    ambienteA: a.ambiente.id,
    ambienteB: b.ambiente.id,
  };
};

type Ctx = Awaited<ReturnType<typeof setupDoisAgentes>>;

const anotarFonte = (ctx: Ctx): AnotarFonte =>
  new AnotarFonte(ctx.ambientes, ctx.catalogo, ctx.anotacoes, ctx.indice, ctx.audit, ctx.logger);

const salvarConsulta = (ctx: Ctx): SalvarConsulta =>
  new SalvarConsulta(ctx.ambientes, ctx.catalogo, ctx.memoria, ctx.indice, ctx.audit, ctx.logger);

const adicionarRelacionamento = (ctx: Ctx): AdicionarRelacionamento =>
  new AdicionarRelacionamento(ctx.ambientes, ctx.catalogo, ctx.audit);

const removerAnotacao = (ctx: Ctx): RemoverAnotacao =>
  new RemoverAnotacao(ctx.ambientes, ctx.anotacoes, ctx.audit);

describe("contexto de consulta por agentId", () => {
  it("obter_fonte devolve regras e sinonimos completos", async () => {
    const { ambientes, catalogo, anotacoes, ambienteA } = await setupDoisAgentes();
    const detalhe = await new ObterFonte(ambientes, catalogo, anotacoes).execute(ACCOUNT, {
      ambienteId: ambienteA,
      fonteId: "vendas",
    });
    expect(detalhe.regras[0]).toEqual(
      expect.objectContaining({
        nome: "Faturamento",
        descricao: expect.stringContaining("cancelada") as string,
      }),
    );
    expect(detalhe.regras.some((r) => r.expressao?.includes("SUM"))).toBe(true);
    expect(detalhe.sinonimos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ termo: "faturamento", descricao: "Soma de ValorTotal" }),
      ]),
    );
    expect(detalhe.relacionamentos[0]?.destino).toEqual(
      expect.objectContaining({ tipo: "fonte", slug: "produtos" }),
    );
  });

  it("anotação e glossário de um agentId não aparecem no outro da mesma conta", async () => {
    const ctx = await setupDoisAgentes();
    const anotar = anotarFonte(ctx);
    await anotar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      fonteId: "vendas",
      tipo: "uso",
      titulo: "Filtro filial",
      texto: "Sempre excluir filial 99 neste banco.",
    });
    await anotar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      tipo: "glossario",
      texto: "Mês fiscal fecha no dia 25.",
    });
    const obter = new ObterFonte(ctx.ambientes, ctx.catalogo, ctx.anotacoes);
    const detalheA = await obter.execute(ACCOUNT, { ambienteId: ctx.ambienteA, fonteId: "vendas" });
    const detalheB = await obter.execute(ACCOUNT, { ambienteId: ctx.ambienteB, fonteId: "vendas" });
    expect(detalheA.anotacoes).toHaveLength(2);
    expect(detalheA.orientacoesIa.some((o) => o.includes("filial 99"))).toBe(true);
    expect(detalheB.anotacoes).toHaveLength(0);
    expect(detalheB.orientacoesIa.some((o) => o.includes("filial 99"))).toBe(false);
    expect(detalheB.orientacoesIa.some((o) => o.includes("dia 25"))).toBe(false);
  });

  it("buscar_contexto não cruza agentId da mesma conta", async () => {
    const ctx = await setupDoisAgentes();
    await anotarFonte(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      texto: "Código X significa cliente VIP só neste ERP.",
    });
    await salvarConsulta(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      pergunta: "qual o total a receber em setembro",
      sql: "SELECT SUM(ValorLiquido) AS Total FROM ContaReceber WHERE DataVencimento >= '2026-09-01'",
    });
    const buscar = new BuscarContexto(ctx.ambientes, ctx.indice);
    const hitsA = await buscar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      pergunta: "total a receber VIP",
    });
    const hitsB = await buscar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteB,
      pergunta: "total a receber VIP",
    });
    expect(hitsA.hits.some((h) => h.tipo === "anotacao")).toBe(true);
    expect(hitsA.hits.some((h) => h.tipo === "consulta")).toBe(true);
    expect(hitsB.hits.some((h) => h.tipo === "anotacao")).toBe(false);
    expect(hitsB.hits.some((h) => h.tipo === "consulta")).toBe(false);
  });

  it("adicionar relacionamento com tabela crua em fonte minha", async () => {
    const ctx = await setupDoisAgentes();
    await new RegistrarFonte(ctx.ambientes, ctx.catalogo, ctx.plug, crypto, ctx.audit).execute(
      ACCOUNT,
      {
        ambienteId: ctx.ambienteA,
        slug: "contas_pagar",
        nome: "Contas a pagar",
        descricao: "Títulos a pagar do ERP para fluxo de caixa.",
        sqlBase: SQL_OK,
        confirmado: true,
        colunas: [
          { nome: "CodTitulo", tipo: "integer", descricao: "Identificador do título." },
          { nome: "Valor", tipo: "decimal", descricao: "Valor em aberto do título." },
        ],
      },
    );
    const result = await adicionarRelacionamento(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      fonteId: "contas_pagar",
      relacionamento: {
        colunaOrigem: "CodTitulo",
        tabelaDestino: "TituloPagarItem",
        colunaDestino: "CodTitulo",
        tipoJoin: "left",
        descricao: "Título → itens do título.",
      },
    });
    expect(result.relacionamentoAdicionado).toBe(true);
    const detalhe = await new ObterFonte(ctx.ambientes, ctx.catalogo, ctx.anotacoes).execute(
      ACCOUNT,
      { ambienteId: ctx.ambienteA, fonteId: "contas_pagar" },
    );
    expect(detalhe.relacionamentos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          colunaOrigem: "CodTitulo",
          destino: { tipo: "tabela", nome: "TituloPagarItem" },
        }),
      ]),
    );
  });

  it("relacionamento incremental em seed é FONTE_READONLY", async () => {
    const ctx = await setupDoisAgentes();
    await expect(
      adicionarRelacionamento(ctx).execute(ACCOUNT, {
        ambienteId: ctx.ambienteA,
        fonteId: "vendas",
        relacionamento: {
          colunaOrigem: "CodCliente",
          tabelaDestino: "ClienteExtra",
          colunaDestino: "CodCliente",
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FONTE_READONLY });
  });

  it("remover_anotacao só apaga no agentId certo", async () => {
    const ctx = await setupDoisAgentes();
    const criada = await anotarFonte(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      texto: "Nota só do banco A.",
    });
    await expect(
      removerAnotacao(ctx).execute(ACCOUNT, {
        ambienteId: ctx.ambienteB,
        anotacaoId: criada.anotacaoId ?? "",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.ANOTACAO_NOT_FOUND });
    const removed = await removerAnotacao(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      anotacaoId: criada.anotacaoId ?? "",
    });
    expect(removed.removida).toBe(true);
  });

  it("listar_anotacoes com fonteId devolve só as notas daquela fonte, sem o glossário", async () => {
    const ctx = await setupDoisAgentes();
    const anotar = anotarFonte(ctx);
    await anotar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      fonteId: "vendas",
      tipo: "uso",
      titulo: "Filtro filial",
      texto: "Sempre excluir filial 99 neste banco.",
    });
    await anotar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      tipo: "glossario",
      texto: "Mês fiscal fecha no dia 25.",
    });
    const listar = new ListarAnotacoes(ctx.ambientes, ctx.catalogo, ctx.anotacoes);
    const porFonte = await listar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      fonteId: "vendas",
    });
    expect(porFonte.total).toBe(1);
    expect(porFonte.anotacoes).toEqual([
      expect.objectContaining({
        fonteSlug: "vendas",
        titulo: "Filtro filial",
        texto: "Sempre excluir filial 99 neste banco.",
      }),
    ]);
  });

  it("listar_anotacoes sem fonteId devolve glossário + notas de qualquer fonte com o slug", async () => {
    const ctx = await setupDoisAgentes();
    const anotar = anotarFonte(ctx);
    await anotar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      fonteId: "vendas",
      texto: "Nota da fonte vendas.",
    });
    await anotar.execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      tipo: "glossario",
      texto: "Mês fiscal fecha no dia 25.",
    });
    const listar = new ListarAnotacoes(ctx.ambientes, ctx.catalogo, ctx.anotacoes);
    const tudo = await listar.execute(ACCOUNT, { ambienteId: ctx.ambienteA });
    expect(tudo.total).toBe(2);
    expect(tudo.anotacoes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fonteSlug: "vendas",
          texto: "Nota da fonte vendas.",
        }),
        expect.objectContaining({
          fonteId: null,
          fonteSlug: null,
          texto: "Mês fiscal fecha no dia 25.",
        }),
      ]),
    );
  });

  it("listar_anotacoes não cruza agentId da mesma conta", async () => {
    const ctx = await setupDoisAgentes();
    await anotarFonte(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      tipo: "glossario",
      texto: "Nota só do banco A.",
    });
    const listar = new ListarAnotacoes(ctx.ambientes, ctx.catalogo, ctx.anotacoes);
    const tudoA = await listar.execute(ACCOUNT, { ambienteId: ctx.ambienteA });
    const tudoB = await listar.execute(ACCOUNT, { ambienteId: ctx.ambienteB });
    expect(tudoA.total).toBe(1);
    expect(tudoB.total).toBe(0);
  });

  it("listar_anotacoes com fonteId inexistente retorna FONTE_NOT_FOUND", async () => {
    const ctx = await setupDoisAgentes();
    const listar = new ListarAnotacoes(ctx.ambientes, ctx.catalogo, ctx.anotacoes);
    await expect(
      listar.execute(ACCOUNT, { ambienteId: ctx.ambienteA, fonteId: "inexistente" }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FONTE_NOT_FOUND });
  });

  it("salvar_consulta rejeita SQL sem FROM, pergunta curta e fonteId inexistente", async () => {
    const ctx = await setupDoisAgentes();
    await expect(
      salvarConsulta(ctx).execute(ACCOUNT, {
        ambienteId: ctx.ambienteA,
        pergunta: "total de setembro",
        sql: "SELECT 1",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await expect(
      salvarConsulta(ctx).execute(ACCOUNT, {
        ambienteId: ctx.ambienteA,
        pergunta: "oi",
        sql: SQL_OK,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await expect(
      salvarConsulta(ctx).execute(ACCOUNT, {
        ambienteId: ctx.ambienteA,
        pergunta: "total de setembro",
        sql: SQL_OK,
        fonteId: "nao_existe",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FONTE_NOT_FOUND });
  });

  it("buscar_contexto rejeita pergunta curta demais", async () => {
    const ctx = await setupDoisAgentes();
    await expect(
      new BuscarContexto(ctx.ambientes, ctx.indice).execute(ACCOUNT, {
        ambienteId: ctx.ambienteA,
        pergunta: "x",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("anotar_fonte, remover_anotacao e salvar_consulta gravam audit_log", async () => {
    const ctx = await setupDoisAgentes();
    const criada = await anotarFonte(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      texto: "Nota auditada.",
    });
    await removerAnotacao(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      anotacaoId: criada.anotacaoId,
    });
    await salvarConsulta(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      pergunta: "total a pagar em setembro",
      sql: SQL_OK,
    });
    const tools = ctx.audit.rows.map((row) => row.tool);
    expect(tools).toEqual(
      expect.arrayContaining(["anotar_fonte", "remover_anotacao", "salvar_consulta"]),
    );
    expect(ctx.audit.rows.every((row) => row.sucesso)).toBe(true);
  });

  it("consulta_memoria expurga registros mais antigos que o cutoff", async () => {
    const ctx = await setupDoisAgentes();
    await salvarConsulta(ctx).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      pergunta: "consulta antiga para retenção",
      sql: SQL_OK,
    });
    const row = ctx.memoria.rows[0];
    expect(row).toBeDefined();
    (row as { aprovadoEm: Date }).aprovadoEm = new Date("2020-01-01T00:00:00.000Z");
    const removed = await ctx.memoria.purgeOlderThan(new Date("2024-01-01T00:00:00.000Z"));
    expect(removed).toBe(1);
    expect(ctx.memoria.rows).toHaveLength(0);
  });

  it("tabelaDestino inválida é VALIDATION_ERROR", async () => {
    const ctx = await setupDoisAgentes();
    await new RegistrarFonte(ctx.ambientes, ctx.catalogo, ctx.plug, crypto, ctx.audit).execute(
      ACCOUNT,
      {
        ambienteId: ctx.ambienteA,
        slug: "contas_pagar",
        nome: "Contas a pagar",
        descricao: "Títulos a pagar do ERP para fluxo de caixa.",
        sqlBase: SQL_OK,
        confirmado: true,
        colunas: [
          { nome: "CodTitulo", tipo: "integer", descricao: "Identificador do título." },
          { nome: "Valor", tipo: "decimal", descricao: "Valor em aberto do título." },
        ],
      },
    );
    await expect(
      adicionarRelacionamento(ctx).execute(ACCOUNT, {
        ambienteId: ctx.ambienteA,
        fonteId: "contas_pagar",
        relacionamento: {
          colunaOrigem: "CodTitulo",
          tabelaDestino: "Titulo Pagar; DROP",
          colunaDestino: "CodTitulo",
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("falha de embedding não impede persistir a anotação", async () => {
    const ctx = await setupDoisAgentes();
    const throwing: IndiceContextoPort = {
      buscar: async () => [],
      indexar: async () => {
        throw new Error("embedding down");
      },
    };
    const result = await new AnotarFonte(
      ctx.ambientes,
      ctx.catalogo,
      ctx.anotacoes,
      throwing,
      ctx.audit,
      ctx.logger,
    ).execute(ACCOUNT, {
      ambienteId: ctx.ambienteA,
      texto: "Nota mesmo com embedding fora.",
    });
    expect(result.anotacaoId).toBeTruthy();
    expect(ctx.anotacoes.rows).toHaveLength(1);
    expect(ctx.logger.warnings.some((w) => w.message.includes("embedding"))).toBe(true);
  });
});
