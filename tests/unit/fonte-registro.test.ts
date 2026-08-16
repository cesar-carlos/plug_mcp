import { describe, expect, it } from "vitest";
import { AtualizarFonte } from "../../src/application/use-cases/atualizar-fonte.js";
import { ConectarAmbiente } from "../../src/application/use-cases/conectar-ambiente.js";
import { ConfigurarClientToken } from "../../src/application/use-cases/configurar-client-token.js";
import { DescreverTabela } from "../../src/application/use-cases/descrever-tabela.js";
import { ExplorarTabelas } from "../../src/application/use-cases/explorar-tabelas.js";
import { ListarFontes } from "../../src/application/use-cases/listar-fontes.js";
import { ObterFonte } from "../../src/application/use-cases/obter-fonte.js";
import { RegistrarFonte } from "../../src/application/use-cases/registrar-fonte.js";
import { RemoverFonte } from "../../src/application/use-cases/remover-fonte.js";
import { TESTAR_SQL_MAX_ROWS } from "../../src/application/use-cases/shared/amostra-sql.js";
import { TestarSql } from "../../src/application/use-cases/testar-sql.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  InMemoryAmbienteRepository,
  InMemoryAnotacaoRepository,
  InMemoryAuditLog,
  InMemoryCatalogoRepository,
} from "../../src/infrastructure/persistence/memory/memory-repos.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const AGENT = "3183a9f2-429b-46d6-a339-3580e5e5cb31";
const AGENT_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

const SQL_OK = "SELECT CodTitulo, Valor FROM TituloPagar WHERE Cancelado = 0";

const definicao = {
  slug: "contas_pagar",
  nome: "Contas a pagar",
  descricao: "Títulos a pagar do ERP para fluxo de caixa.",
  sqlBase: SQL_OK,
  colunas: [
    { nome: "CodTitulo", tipo: "integer", descricao: "Identificador do título." },
    { nome: "Valor", tipo: "decimal", descricao: "Valor em aberto do título." },
  ],
};

const setupPronto = async () => {
  const ambientes = new InMemoryAmbienteRepository();
  const catalogo = new InMemoryCatalogoRepository();
  await catalogo.seedIfEmpty();
  const plug = new FakePlugServer();
  const audit = new InMemoryAuditLog();
  plug.approve(AGENT);
  const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
    agentId: AGENT,
    dialeto: "mssql",
    nomeAmigavel: "Matriz",
  });
  await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
    ambienteId: created.ambiente.id,
    clientToken: "tok-erp-1",
  });
  plug.sqlImpl = async () => ({
    columns: ["CodTitulo", "Valor"],
    rows: [{ CodTitulo: 1, Valor: 10 }],
  });
  return { ambientes, catalogo, plug, audit, ambienteId: created.ambiente.id };
};

describe("registro de fontes pelo usuário", () => {
  it("registra, aparece em listar_fontes com origem minha e obter_fonte devolve o SQL da conta", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    const result = await new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(
      ACCOUNT,
      { ambienteId, ...definicao, confirmado: true },
    );
    expect(result.slug).toBe("contas_pagar");
    expect(result.origem).toBe("minha");
    const list = await new ListarFontes(ambientes, catalogo).execute(ACCOUNT, ambienteId);
    expect(list.fontes.find((f) => f.id === "contas_pagar")?.origem).toBe("minha");
    const detalhe = await new ObterFonte(
      ambientes,
      catalogo,
      new InMemoryAnotacaoRepository(),
    ).execute(ACCOUNT, {
      ambienteId,
      fonteId: "contas_pagar",
    });
    expect(detalhe.sqlBase).toBe(SQL_OK);
    expect(detalhe.origem).toBe("minha");
  });

  it("sqlBase sem FROM falha antes de chamar o plug", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    plug.lastSql = null;
    await expect(
      new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        ...definicao,
        sqlBase: "SELECT 1 AS x WHERE 1 = 1 AND 2 = 2",
        confirmado: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(plug.lastSql).toBeNull();
  });

  it("coluna declarada ausente no dry run não persiste", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => ({ columns: ["CodTitulo"], rows: [{ CodTitulo: 1 }] });
    await expect(
      new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        ...definicao,
        confirmado: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(catalogo.fontes.filter((f) => f.slug === "contas_pagar")).toHaveLength(0);
  });

  it("falha do dry run não persiste e grava audit com sucesso false", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => {
      throw new DomainError({
        code: ERROR_CODES.INVALID_SQL,
        message: "sql inválido",
        hint: "corrija",
      });
    };
    await expect(
      new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        ...definicao,
        confirmado: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_SQL });
    expect(catalogo.fontes.some((f) => f.slug === "contas_pagar")).toBe(false);
    expect(audit.rows.some((row) => row.tool === "registrar_fonte" && !row.sucesso)).toBe(true);
  });

  it("slug repetido na mesma conta e agente vira FONTE_JA_EXISTE", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    const uc = new RegistrarFonte(ambientes, catalogo, plug, crypto, audit);
    await uc.execute(ACCOUNT, { ambienteId, ...definicao, confirmado: true });
    await expect(
      uc.execute(ACCOUNT, { ambienteId, ...definicao, confirmado: true }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FONTE_JA_EXISTE,
    });
  });

  it("atualizar e remover fonte do seed viram FONTE_READONLY", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    await expect(
      new AtualizarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        ...definicao,
        slug: "vendas",
        sqlBase: "SELECT CodVenda, DataVenda FROM Venda WHERE Cancelada = 0",
        colunas: [
          { nome: "CodVenda", tipo: "integer", descricao: "Id da venda." },
          { nome: "DataVenda", tipo: "datetime", descricao: "Data da venda." },
        ],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FONTE_READONLY });
    await expect(
      new RemoverFonte(ambientes, catalogo, audit).execute(ACCOUNT, {
        ambienteId,
        slug: "vendas",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FONTE_READONLY });
  });

  it("isolamento: fonte da conta A não resolve na conta B nem em outro agentId", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    await new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      ...definicao,
      confirmado: true,
    });
    plug.approve(AGENT_B);
    const other = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT_B, {
      agentId: AGENT_B,
      dialeto: "mssql",
      nomeAmigavel: "Outra",
    });
    await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT_B, {
      ambienteId: other.ambiente.id,
      clientToken: "tok-b",
    });
    const listB = await new ListarFontes(ambientes, catalogo).execute(ACCOUNT_B, other.ambiente.id);
    expect(listB.fontes.find((f) => f.id === "contas_pagar")).toBeUndefined();
    await expect(
      new ObterFonte(ambientes, catalogo, new InMemoryAnotacaoRepository()).execute(ACCOUNT_B, {
        ambienteId: other.ambiente.id,
        fonteId: "contas_pagar",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.FONTE_NOT_FOUND });

    const sameAccountOtherAgent = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT_B,
      dialeto: "mssql",
      nomeAmigavel: "Filial",
    });
    const listOtherAgent = await new ListarFontes(ambientes, catalogo).execute(
      ACCOUNT,
      sameAccountOtherAgent.ambiente.id,
    );
    expect(listOtherAgent.fontes.find((f) => f.id === "contas_pagar")).toBeUndefined();
  });

  it("atualizar_fonte substitui colunas sem duplicar e remover faz o seed voltar a valer", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => ({
      columns: ["CodVenda", "DataVenda"],
      rows: [{ CodVenda: 1, DataVenda: "2026-01-01" }],
    });
    await new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      slug: "vendas",
      nome: "Vendas da loja",
      descricao: "Itens vendidos com regra local da loja.",
      sqlBase: "SELECT CodVenda, DataVenda FROM Venda WHERE Cancelada = 0",
      colunas: [
        { nome: "CodVenda", tipo: "integer", descricao: "Id da venda." },
        { nome: "DataVenda", tipo: "datetime", descricao: "Data da venda." },
      ],
      confirmado: true,
    });
    plug.sqlImpl = async () => ({
      columns: ["CodVenda"],
      rows: [{ CodVenda: 1 }],
    });
    await new AtualizarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      slug: "vendas",
      nome: "Vendas da loja",
      descricao: "Itens vendidos com regra local da loja.",
      sqlBase: "SELECT CodVenda FROM Venda WHERE Cancelada = 0",
      colunas: [{ nome: "CodVenda", tipo: "integer", descricao: "Id da venda." }],
      confirmado: true,
    });
    const proprias = catalogo.fontes.filter(
      (f) => f.slug === "vendas" && f.mcpAccountId === ACCOUNT,
    );
    expect(proprias).toHaveLength(1);
    expect(catalogo.colunas.filter((c) => c.fonteId === proprias[0]!.id)).toHaveLength(1);
    const removed = await new RemoverFonte(ambientes, catalogo, audit).execute(ACCOUNT, {
      ambienteId,
      slug: "vendas",
    });
    expect(removed.seedVoltouAValer).toBe(true);
    const detalhe = await new ObterFonte(
      ambientes,
      catalogo,
      new InMemoryAnotacaoRepository(),
    ).execute(ACCOUNT, {
      ambienteId,
      fonteId: "vendas",
    });
    expect(detalhe.fonte.nome).toBe("Vendas");
  });

  it("explorar_tabelas aplica o teto de linhas", async () => {
    const { ambientes, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => ({
      columns: ["schema_name", "table_name", "object_type"],
      rows: Array.from({ length: 200 }, (_, i) => ({
        schema_name: "dbo",
        table_name: `T${i}`,
        object_type: "table",
      })),
    });
    const result = await new ExplorarTabelas(ambientes, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      filtro: "T",
    });
    expect(result.tabelas).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(plug.lastParams).toEqual({ filtro: "%T%" });
  });

  it("descrever_tabela rejeita nome inválido sem chamar o plug e passa tabela como param", async () => {
    const { ambientes, plug, audit, ambienteId } = await setupPronto();
    plug.lastSql = null;
    await expect(
      new DescreverTabela(ambientes, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        tabela: "Titulo; DROP",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(plug.lastSql).toBeNull();

    plug.sqlImpl = async () => ({
      columns: ["column_name", "data_type", "is_nullable"],
      rows: [{ column_name: "CodTitulo", data_type: "int", is_nullable: "NO" }],
    });
    await new DescreverTabela(ambientes, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      tabela: "dbo.TituloPagar",
    });
    expect(plug.lastSql).not.toContain("TituloPagar");
    expect(plug.lastParams).toEqual({ tabela: "TituloPagar", schema: "dbo" });
  });

  it("PERMISSION_DENIED na descoberta chega com hint para pedir os nomes ao usuário", async () => {
    const { ambientes, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => {
      throw new DomainError({
        code: ERROR_CODES.PERMISSION_DENIED,
        message: "sem permissão",
        hint: "genérico",
      });
    };
    try {
      await new ExplorarTabelas(ambientes, plug, crypto, audit).execute(ACCOUNT, { ambienteId });
      throw new Error("expected");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.PERMISSION_DENIED);
      expect((error as DomainError).hint).toContain("Peça ao usuário");
    }
  });

  it("registrar_fonte sem confirmado não persiste e pede resumo ao usuário", async () => {
    const { ambientes, catalogo, plug, audit, ambienteId } = await setupPronto();
    plug.lastSql = null;
    await expect(
      new RegistrarFonte(ambientes, catalogo, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        ...definicao,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(catalogo.fontes.some((f) => f.slug === "contas_pagar")).toBe(false);
    expect(plug.lastSql).toBeNull();
  });

  it("testar_sql valida o SQL e devolve colunas; sem FROM não chama o plug", async () => {
    const { ambientes, plug, audit, ambienteId } = await setupPronto();
    const ok = await new TestarSql(ambientes, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      sql: SQL_OK,
    });
    expect(ok.valido).toBe(true);
    expect(ok.columns).toEqual(["CodTitulo", "Valor"]);
    expect(plug.lastOptions).toEqual({ maxRows: TESTAR_SQL_MAX_ROWS });

    plug.lastSql = null;
    await expect(
      new TestarSql(ambientes, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        sql: "SELECT 1 AS x WHERE 1 = 1 AND 2 = 2",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(plug.lastSql).toBeNull();
  });

  it("testar_sql propaga erro do ERP e pede para não registrar ainda", async () => {
    const { ambientes, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => {
      throw new DomainError({
        code: ERROR_CODES.INVALID_SQL,
        message: "sql inválido",
        hint: "corrija o SELECT",
      });
    };
    try {
      await new TestarSql(ambientes, plug, crypto, audit).execute(ACCOUNT, {
        ambienteId,
        sql: SQL_OK,
      });
      throw new Error("expected");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.INVALID_SQL);
      expect((error as DomainError).hint).toContain("Não chame registrar_fonte");
    }
    expect(audit.rows.some((row) => row.tool === "testar_sql" && !row.sucesso)).toBe(true);
  });

  it("testar_sql aponta Status de uma letra em colunasCodigo e pede dicionário", async () => {
    const { ambientes, plug, audit, ambienteId } = await setupPronto();
    plug.sqlImpl = async () => ({
      columns: ["CodEmpresa", "Status", "Valor"],
      rows: [{ CodEmpresa: 1, Status: "A", Valor: 1500.5 }],
    });
    const ok = await new TestarSql(ambientes, plug, crypto, audit).execute(ACCOUNT, {
      ambienteId,
      sql: "SELECT CodEmpresa, Status, Valor FROM ContaReceber",
    });
    expect(ok.colunasCodigo).toEqual([{ coluna: "Status", valoresVistos: ["A"] }]);
    expect(ok.estrutura.find((col) => col.nome === "Status")?.tipoInferido).toBe("char");
    expect(ok.hint).toContain("Status=A");
    expect(ok.hint).toContain("Nunca chute");
  });
});
