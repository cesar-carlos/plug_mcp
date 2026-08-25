import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { lastIdent, type SqlModelo } from "./sql-modelo.js";
import { columnQualifier } from "./sql-modelo.js";
import { tryParseSelect } from "./sql-ast.js";

const pushUnique = (map: Record<string, string[]>, tabela: string, coluna: string): void => {
  const list = map[tabela] ?? [];
  if (!list.some((item) => item.toLowerCase() === coluna.toLowerCase())) {
    list.push(coluna);
  }
  map[tabela] = list;
};

const uniqueGrao = (nomes: readonly string[]): string[] => {
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

const inferirGrao = (modelo: SqlModelo): string[] => {
  const ast = tryParseSelect(modelo.sql);
  if (ast?.temGroupBy && ast.groupByRefs.length > 0) {
    return uniqueGrao(ast.groupByRefs.map((ref) => ref.column));
  }
  if (ast) {
    return uniqueGrao(
      ast.colunas
        .filter((coluna) => !coluna.isAggregate && coluna.column && coluna.column !== "*")
        .map((coluna) => coluna.column ?? ""),
    );
  }
  return uniqueGrao(
    modelo.colunas
      .filter((coluna) => !coluna.expr.includes("("))
      .map((coluna) => lastIdent(coluna.expr)),
  );
};

export const escopoFromSqlModelo = (modelo: SqlModelo): EscopoSkill => {
  const aliasToTable = new Map<string, string>();
  for (const tabela of modelo.tabelas) {
    aliasToTable.set(tabela.nome.toLowerCase(), tabela.nome);
    if (tabela.alias) {
      aliasToTable.set(tabela.alias.toLowerCase(), tabela.nome);
    }
  }
  const colunasPorTabela: Record<string, string[]> = {};
  for (const tabela of modelo.tabelas) {
    colunasPorTabela[tabela.nome] = colunasPorTabela[tabela.nome] ?? [];
  }
  for (const coluna of modelo.colunas) {
    const qualifier = columnQualifier(coluna.expr);
    const tabelaNome = qualifier
      ? aliasToTable.get(qualifier.toLowerCase())
      : modelo.tabelas[0]?.nome;
    const nomeColuna = lastIdent(coluna.expr);
    if (tabelaNome && nomeColuna) {
      pushUnique(colunasPorTabela, tabelaNome, nomeColuna);
    }
  }
  const relacionamentos = modelo.relacionamentos.flatMap((rel) => {
    const on = rel.on ?? "";
    const match =
      /([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)\s*=\s*([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)/.exec(
        on,
      );
    if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
      return [];
    }
    const tabelaOrigem = aliasToTable.get(match[1].toLowerCase()) ?? match[1];
    const tabelaDestino = aliasToTable.get(match[3].toLowerCase()) ?? match[3];
    pushUnique(colunasPorTabela, tabelaOrigem, match[2]);
    pushUnique(colunasPorTabela, tabelaDestino, match[4]);
    return [
      {
        tabelaOrigem,
        colunaOrigem: match[2],
        tabelaDestino,
        colunaDestino: match[4],
        tipoJoin: rel.tipoJoin,
      },
    ];
  });
  return {
    tabelas: modelo.tabelas.map((tabela) => tabela.nome),
    colunasPorTabela,
    relacionamentos,
    grao: inferirGrao(modelo),
  };
};
