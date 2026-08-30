import type { ColunaGrafo, RelacionamentoGrafo, TabelaGrafo } from "../../domain/entities/grafo.js";
import { labelPares } from "../../domain/entities/relacionamento.js";
import type { ConflitoGrafo } from "../../domain/ports/grafo-repository.port.js";

export const montarListaConflitos = (
  tabelas: readonly TabelaGrafo[],
  colunas: readonly ColunaGrafo[],
  rels: readonly RelacionamentoGrafo[],
): ConflitoGrafo[] => {
  const nomeById = new Map(tabelas.map((tabela) => [tabela.id, tabela.nome]));
  const out: ConflitoGrafo[] = [];
  for (const tabela of tabelas) {
    if (tabela.status !== "conflito") {
      continue;
    }
    out.push({
      kind: "tabela",
      tabelaId: tabela.id,
      tabela: tabela.nome,
      hint: `Tabela ${tabela.nome} em conflito. Chame resolver_conflito com tabelaId.`,
    });
  }
  for (const coluna of colunas) {
    if (coluna.status !== "conflito") {
      continue;
    }
    const tabela = nomeById.get(coluna.tabelaId) ?? coluna.tabelaId;
    out.push({
      kind: "coluna",
      tabelaId: coluna.tabelaId,
      colunaId: coluna.id,
      tabela,
      coluna: coluna.nome,
      hint: `Coluna ${tabela}.${coluna.nome} em conflito. Chame resolver_conflito com colunaId.`,
    });
  }
  for (const rel of rels) {
    if (rel.status !== "conflito") {
      continue;
    }
    const origem = nomeById.get(rel.tabelaOrigemId) ?? "";
    const destino = nomeById.get(rel.tabelaDestinoId) ?? "";
    const join = labelPares(origem, destino, rel.pares);
    out.push({
      kind: "join",
      relacionamentoId: rel.id,
      tabela: origem,
      join,
      hint: `JOIN ${join} em conflito. Chame resolver_conflito com relacionamentoId.`,
    });
  }
  return out;
};
