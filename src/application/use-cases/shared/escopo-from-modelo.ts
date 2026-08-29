import type {
  EscopoSkill,
  MetricaSaida,
  RelacionamentoEscopo,
} from "../../../domain/entities/escopo.js";
import { PACOTE_VERSAO_ATUAL } from "../../../domain/entities/escopo.js";
import { paresDeIgualdades } from "../../../domain/entities/relacionamento.js";
import { lastIdent, type SqlModelo } from "./sql-modelo.js";
import { tryParseSelect, walkSelectTree, type SqlAstSelect, type SqlAstTabela } from "./sql-ast.js";

const pushUnique = (map: Record<string, string[]>, tabela: string, coluna: string): void => {
  const list = map[tabela] ?? [];
  if (!list.some((item) => item.toLowerCase() === coluna.toLowerCase())) {
    list.push(coluna);
  }
  map[tabela] = list;
};

const resolveNomeTabela = (ast: SqlAstSelect, aliasOrName: string | null): string | null => {
  if (!aliasOrName) {
    const fisicas = ast.tabelas.filter((tabela) => !tabela.isCte && !tabela.isSubquery);
    return fisicas.length === 1 ? (fisicas[0]?.nome ?? null) : null;
  }
  const wanted = aliasOrName.toLowerCase();
  const found = ast.tabelas.find(
    (tabela) =>
      tabela.nome.toLowerCase() === wanted ||
      (tabela.alias !== null && tabela.alias.toLowerCase() === wanted),
  );
  if (!found || found.isCte || found.isSubquery) {
    return null;
  }
  return found.nome;
};

const unique = (nomes: readonly string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const nome of nomes) {
    const ident = lastIdent(nome);
    if (!ident) {
      continue;
    }
    const key = ident.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(ident);
  }
  return out;
};

const addRef = (
  ast: SqlAstSelect,
  colunasPorTabela: Record<string, string[]>,
  table: string | null,
  column: string,
): string | null => {
  const tabela = resolveNomeTabela(ast, table);
  if (tabela && column && column !== "*") {
    pushUnique(colunasPorTabela, tabela, column);
    return tabela;
  }
  return null;
};

export const escopoFromAst = (ast: SqlAstSelect): EscopoSkill => {
  const tabelas: string[] = [];
  const seenTabela = new Set<string>();
  const colunasPorTabela: Record<string, string[]> = {};
  const relacionamentos: RelacionamentoEscopo[] = [];
  const relSeen = new Set<string>();
  const graoPorTabela: Record<string, string[]> = {};
  const graoResultado: string[] = [];
  const metricasSaida: MetricaSaida[] = [];

  const rememberTabela = (tabela: SqlAstTabela): void => {
    if (tabela.isCte || tabela.isSubquery) {
      return;
    }
    const key = tabela.nome.toLowerCase();
    if (seenTabela.has(key)) {
      return;
    }
    seenTabela.add(key);
    tabelas.push(tabela.nome);
    colunasPorTabela[tabela.nome] = colunasPorTabela[tabela.nome] ?? [];
  };

  walkSelectTree(ast, (item) => {
    for (const tabela of item.tabelas) {
      rememberTabela(tabela);
    }
    for (const coluna of item.colunas) {
      if (coluna.isExpression) {
        continue;
      }
      if (coluna.column) {
        addRef(item, colunasPorTabela, coluna.table, coluna.column);
      }
    }
    for (const ref of item.filtroRefs) {
      addRef(item, colunasPorTabela, ref.table, ref.column);
    }
    for (const ref of item.orderByRefs) {
      addRef(item, colunasPorTabela, ref.table, ref.column);
    }
    for (const join of item.joins) {
      const eqs: {
        leftTable: string;
        leftColumn: string;
        rightTable: string;
        rightColumn: string;
      }[] = [];
      for (const eq of join.equalities) {
        const origem = addRef(item, colunasPorTabela, eq.leftAlias, eq.leftColumn);
        const destino = addRef(item, colunasPorTabela, eq.rightAlias, eq.rightColumn);
        if (!origem || !destino) {
          continue;
        }
        eqs.push({
          leftTable: origem,
          leftColumn: eq.leftColumn,
          rightTable: destino,
          rightColumn: eq.rightColumn,
        });
      }
      const grouped = paresDeIgualdades(eqs);
      if (!grouped) {
        continue;
      }
      const key = [
        grouped.tabelaOrigem,
        grouped.tabelaDestino,
        grouped.pares.map((par) => `${par.colunaOrigem}=${par.colunaDestino}`).join("&"),
      ]
        .join("|")
        .toLowerCase();
      if (relSeen.has(key)) {
        continue;
      }
      relSeen.add(key);
      const first = grouped.pares[0]!;
      relacionamentos.push({
        tabelaOrigem: grouped.tabelaOrigem,
        colunaOrigem: first.colunaOrigem,
        tabelaDestino: grouped.tabelaDestino,
        colunaDestino: first.colunaDestino,
        pares: grouped.pares,
        tipoJoin: join.tipoJoin,
      });
    }
  });

  if (ast.temGroupBy && ast.groupByRefs.length > 0) {
    for (const ref of ast.groupByRefs) {
      const tabela = addRef(ast, colunasPorTabela, ref.table, ref.column);
      if (tabela) {
        pushUnique(graoPorTabela, tabela, ref.column);
      }
      graoResultado.push(ref.column);
    }
  } else {
    for (const coluna of ast.colunas) {
      if (coluna.isAggregate || coluna.isExpression || !coluna.column || coluna.column === "*") {
        continue;
      }
      const tabela = addRef(ast, colunasPorTabela, coluna.table, coluna.column);
      if (tabela) {
        pushUnique(graoPorTabela, tabela, coluna.column);
      }
      graoResultado.push(coluna.column);
    }
  }

  for (const coluna of ast.colunas) {
    if (coluna.isExpression && coluna.alias) {
      metricasSaida.push({ alias: coluna.alias, expr: coluna.expr });
    }
  }

  return {
    tabelas,
    colunasPorTabela,
    relacionamentos,
    graoPorTabela,
    graoResultado: unique(graoResultado),
    metricasSaida,
    pacoteVersao: PACOTE_VERSAO_ATUAL,
  };
};

export const escopoFromSqlModelo = (modelo: SqlModelo): EscopoSkill => {
  const ast = tryParseSelect(modelo.sql);
  if (!ast) {
    return {
      tabelas: modelo.tabelas.map((tabela) => tabela.nome),
      colunasPorTabela: {},
      relacionamentos: [],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    };
  }
  return escopoFromAst(ast);
};
