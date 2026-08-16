type Dialeto = "mssql" | "sybase" | "postgres" | "firebird";

export interface CatalogoSeed {
  slug: string;
  nome: string;
  descricao: string;
  colunas: {
    nome: string;
    tipo: string;
    descricao: string;
    regraNegocio?: string;
    ordem: number;
  }[];
  relacionamentos: {
    colunaOrigem: string;
    fonteDestinoSlug: string;
    colunaDestino: string;
    tipoJoin: string;
    descricao: string;
  }[];
  regras: { nome: string; descricao: string; expressao?: string }[];
  sinonimos: { termo: string; descricao: string }[];
  sql: Record<Dialeto, { sqlBase: string; observacoes: string }>;
}

const vendasSelect = (from: string, join: string, cancelCol: string, cols: string) =>
  `SELECT ${cols} FROM ${from} INNER JOIN ${join} WHERE ${cancelCol} = 0`;

const vendaColsAnsi =
  "Venda.CodVenda, Venda.DataVenda, Venda.CodCliente, Venda.CodVendedor, Item.CodProduto, Item.Quantidade, Item.ValorUnitario, Item.ValorTotal";
const vendaColsFb =
  "VENDA.CODVENDA, VENDA.DATAVENDA, VENDA.CODCLIENTE, VENDA.CODVENDEDOR, ITEM.CODPRODUTO, ITEM.QUANTIDADE, ITEM.VALORUNITARIO, ITEM.VALORTOTAL";

export const catalogoSeed: CatalogoSeed[] = [
  {
    slug: "vendas",
    nome: "Vendas",
    descricao:
      "Itens vendidos no ERP. Use para faturamento, quantidade, vendedores, produtos e períodos. Uma venda pode ter vários itens.",
    colunas: [
      { nome: "CodVenda", tipo: "integer", descricao: "Identificador da venda.", ordem: 1 },
      {
        nome: "DataVenda",
        tipo: "datetime",
        descricao: "Data em que a venda foi realizada.",
        ordem: 2,
      },
      { nome: "CodCliente", tipo: "integer", descricao: "Código do cliente.", ordem: 3 },
      { nome: "CodVendedor", tipo: "integer", descricao: "Vendedor responsável.", ordem: 4 },
      { nome: "CodProduto", tipo: "integer", descricao: "Produto vendido.", ordem: 5 },
      { nome: "Quantidade", tipo: "decimal", descricao: "Quantidade física vendida.", ordem: 6 },
      {
        nome: "ValorUnitario",
        tipo: "decimal",
        descricao: "Preço unitário do item. Não confundir com ValorTotal.",
        ordem: 7,
      },
      {
        nome: "ValorTotal",
        tipo: "decimal",
        descricao: "Valor bruto do item vendido. Base de faturamento.",
        regraNegocio: "Não inclui vendas canceladas (já filtradas no SQL base).",
        ordem: 8,
      },
    ],
    relacionamentos: [
      {
        colunaOrigem: "CodProduto",
        fonteDestinoSlug: "produtos",
        colunaDestino: "CodProduto",
        tipoJoin: "inner",
        descricao: "Item de venda → cadastro de produto.",
      },
      {
        colunaOrigem: "CodCliente",
        fonteDestinoSlug: "clientes",
        colunaDestino: "CodCliente",
        tipoJoin: "inner",
        descricao: "Venda → cadastro de cliente.",
      },
    ],
    regras: [
      {
        nome: "Faturamento",
        descricao: "Venda cancelada não entra no faturamento. O SQL base já exclui Cancelada = 1.",
      },
      {
        nome: "Ticket médio",
        descricao: "Faturamento / quantidade distinta de CodVenda, não de itens.",
        expressao: "SUM(ValorTotal) / COUNT(DISTINCT CodVenda)",
      },
    ],
    sinonimos: [
      { termo: "faturamento", descricao: "Soma de ValorTotal" },
      { termo: "receita", descricao: "Soma de ValorTotal" },
    ],
    sql: {
      mssql: {
        sqlBase: vendasSelect(
          "Venda",
          "ItemVenda AS Item ON Item.CodVenda = Venda.CodVenda",
          "Venda.Cancelada",
          vendaColsAnsi,
        ),
        observacoes:
          "SQL Server: TOP n em vez de LIMIT. Datas: DATEADD, GETDATE(), CONVERT(date, DataVenda). Paginação OFFSET/FETCH exige ORDER BY.",
      },
      sybase: {
        sqlBase: vendasSelect(
          "Venda",
          "ItemVenda Item ON Item.CodVenda = Venda.CodVenda",
          "Venda.Cancelada",
          vendaColsAnsi,
        ),
        observacoes:
          "Sybase ASE: TOP n. Datas: DATEADD, GETDATE(). Evite OFFSET; prefira TOP ou filtros de chave.",
      },
      postgres: {
        sqlBase: vendasSelect(
          "venda",
          "item_venda AS item ON item.codvenda = venda.codvenda",
          "venda.cancelada",
          'venda.codvenda AS "CodVenda", venda.datavenda AS "DataVenda", venda.codcliente AS "CodCliente", venda.codvendedor AS "CodVendedor", item.codproduto AS "CodProduto", item.quantidade AS "Quantidade", item.valorunitario AS "ValorUnitario", item.valortotal AS "ValorTotal"',
        ),
        observacoes:
          "PostgreSQL: LIMIT/OFFSET. Datas: CURRENT_DATE, intervalo ('1 month'::interval). Use aliases entre aspas para manter nomes do catálogo.",
      },
      firebird: {
        sqlBase: vendasSelect(
          "VENDA",
          "ITEMVENDA ITEM ON ITEM.CODVENDA = VENDA.CODVENDA",
          "VENDA.CANCELADA",
          vendaColsFb,
        ),
        observacoes:
          "Firebird: FIRST n (não LIMIT/TOP). Datas: CURRENT_DATE, DATEADD. Aliases sem aspas ficam UPPERCASE.",
      },
    },
  },
  {
    slug: "produtos",
    nome: "Produtos",
    descricao: "Cadastro de produtos comercializados.",
    colunas: [
      { nome: "CodProduto", tipo: "integer", descricao: "Identificador do produto.", ordem: 1 },
      { nome: "Descricao", tipo: "string", descricao: "Nome comercial do produto.", ordem: 2 },
      { nome: "Unidade", tipo: "string", descricao: "Unidade de medida (UN, KG, CX).", ordem: 3 },
      {
        nome: "PrecoVenda",
        tipo: "decimal",
        descricao: "Preço de tabela atual (não é o valor histórico da venda).",
        ordem: 4,
      },
      {
        nome: "Ativo",
        tipo: "boolean",
        descricao: "1/true se o produto está ativo no cadastro.",
        ordem: 5,
      },
    ],
    relacionamentos: [],
    regras: [
      {
        nome: "Preço vs venda",
        descricao:
          "PrecoVenda do cadastro não substitui ValorUnitario da fonte Vendas para faturamento histórico.",
      },
    ],
    sinonimos: [
      { termo: "item", descricao: "produto" },
      { termo: "sku", descricao: "CodProduto" },
    ],
    sql: {
      mssql: {
        sqlBase:
          "SELECT Produto.CodProduto, Produto.Descricao, Produto.Unidade, Produto.PrecoVenda, Produto.Ativo FROM Produto WHERE Produto.Ativo = 1",
        observacoes: "SQL Server: TOP n. Filtro Ativo = 1 já no SQL base.",
      },
      sybase: {
        sqlBase:
          "SELECT Produto.CodProduto, Produto.Descricao, Produto.Unidade, Produto.PrecoVenda, Produto.Ativo FROM Produto WHERE Produto.Ativo = 1",
        observacoes: "Sybase: TOP n. Filtro Ativo = 1 já no SQL base.",
      },
      postgres: {
        sqlBase:
          'SELECT produto.codproduto AS "CodProduto", produto.descricao AS "Descricao", produto.unidade AS "Unidade", produto.precovenda AS "PrecoVenda", produto.ativo AS "Ativo" FROM produto WHERE produto.ativo = true',
        observacoes: "PostgreSQL: LIMIT. Ativo pode ser boolean.",
      },
      firebird: {
        sqlBase:
          "SELECT PRODUTO.CODPRODUTO, PRODUTO.DESCRICAO, PRODUTO.UNIDADE, PRODUTO.PRECOVENDA, PRODUTO.ATIVO FROM PRODUTO WHERE PRODUTO.ATIVO = 1",
        observacoes: "Firebird: FIRST n. Ativo numérico 1/0.",
      },
    },
  },
  {
    slug: "clientes",
    nome: "Clientes",
    descricao: "Cadastro de clientes do ERP.",
    colunas: [
      { nome: "CodCliente", tipo: "integer", descricao: "Identificador do cliente.", ordem: 1 },
      { nome: "Nome", tipo: "string", descricao: "Razão social ou nome fantasia.", ordem: 2 },
      { nome: "Cidade", tipo: "string", descricao: "Cidade do cadastro.", ordem: 3 },
      { nome: "UF", tipo: "string", descricao: "Unidade federativa.", ordem: 4 },
      { nome: "Ativo", tipo: "boolean", descricao: "Cliente ativo no cadastro.", ordem: 5 },
    ],
    relacionamentos: [],
    regras: [
      {
        nome: "Clientes que compraram",
        descricao:
          "Para 'quantos clientes compraram', faça JOIN/IN com Vendas no período; não conte o cadastro inteiro.",
      },
    ],
    sinonimos: [{ termo: "comprador", descricao: "cliente" }],
    sql: {
      mssql: {
        sqlBase:
          "SELECT Cliente.CodCliente, Cliente.Nome, Cliente.Cidade, Cliente.UF, Cliente.Ativo FROM Cliente WHERE Cliente.Ativo = 1",
        observacoes: "SQL Server: TOP n.",
      },
      sybase: {
        sqlBase:
          "SELECT Cliente.CodCliente, Cliente.Nome, Cliente.Cidade, Cliente.UF, Cliente.Ativo FROM Cliente WHERE Cliente.Ativo = 1",
        observacoes: "Sybase: TOP n.",
      },
      postgres: {
        sqlBase:
          'SELECT cliente.codcliente AS "CodCliente", cliente.nome AS "Nome", cliente.cidade AS "Cidade", cliente.uf AS "UF", cliente.ativo AS "Ativo" FROM cliente WHERE cliente.ativo = true',
        observacoes: "PostgreSQL: LIMIT.",
      },
      firebird: {
        sqlBase:
          "SELECT CLIENTE.CODCLIENTE, CLIENTE.NOME, CLIENTE.CIDADE, CLIENTE.UF, CLIENTE.ATIVO FROM CLIENTE WHERE CLIENTE.ATIVO = 1",
        observacoes: "Firebird: FIRST n.",
      },
    },
  },
];

export const orientacoesBase = (dialeto: Dialeto, observacoes: string): string[] => [
  "Use este SQL como base (subquery/CTE); acrescente WHERE, GROUP BY e agregações conforme a pergunta.",
  "Para totais e contagens, agregue no SQL (SUM/COUNT) em vez de trazer todas as linhas.",
  "Para listagens, use options.page e options.page_size em consultar_dados e declare ORDER BY explícito.",
  "Use params nomeados para datas e ids; não concatene literais na string SQL.",
  observacoes,
  `Dialeto ativo: ${dialeto}. Não misture sintaxe de outro banco.`,
];
