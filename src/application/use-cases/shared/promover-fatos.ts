import type { OrigemFato } from "../../../domain/entities/grafo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { columnQualifier, lastIdent, parseJoinEqualities, type SqlModelo } from "./sql-modelo.js";

const ORIGEM: OrigemFato = "validado_execucao";

export const promoverFatosDaExecucao = async (input: {
  grafo: GrafoRepositoryPort;
  agentId: string;
  autorUsuarioId: string;
  modelo: SqlModelo;
}): Promise<void> => {
  await input.grafo.withAgentLock(input.agentId, async () => {
    const tabelaIds = new Map<string, string>();
    const aliasToId = new Map<string, string>();
    for (const tabela of input.modelo.tabelas) {
      const merged = await input.grafo.mergeTabela({
        agentId: input.agentId,
        nome: tabela.nome,
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
      tabelaIds.set(tabela.nome.toLowerCase(), merged.tabela.id);
      aliasToId.set((tabela.alias ?? tabela.nome).toLowerCase(), merged.tabela.id);
      aliasToId.set(tabela.nome.toLowerCase(), merged.tabela.id);
    }
    for (const coluna of input.modelo.colunas) {
      const qualifier = columnQualifier(coluna.expr);
      let tabelaId: string | undefined;
      if (qualifier) {
        tabelaId = aliasToId.get(qualifier.toLowerCase());
      } else if (input.modelo.tabelas.length === 1) {
        const only = input.modelo.tabelas[0];
        tabelaId = only ? tabelaIds.get(only.nome.toLowerCase()) : undefined;
      }
      if (!tabelaId) {
        continue;
      }
      await input.grafo.mergeColuna({
        tabelaId,
        nome: lastIdent(coluna.expr),
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
    }
    for (const rel of input.modelo.relacionamentos) {
      if (rel.tipoJoin.includes("cross")) {
        continue;
      }
      for (const eq of parseJoinEqualities(rel.on)) {
        const origemId = aliasToId.get(eq.leftAlias.toLowerCase());
        const destinoId = aliasToId.get(eq.rightAlias.toLowerCase());
        if (!origemId || !destinoId) {
          continue;
        }
        await input.grafo.mergeColuna({
          tabelaId: origemId,
          nome: eq.leftColumn,
          origem: ORIGEM,
          autorUsuarioId: input.autorUsuarioId,
        });
        await input.grafo.mergeColuna({
          tabelaId: destinoId,
          nome: eq.rightColumn,
          origem: ORIGEM,
          autorUsuarioId: input.autorUsuarioId,
        });
        await input.grafo.mergeRelacionamento({
          agentId: input.agentId,
          tabelaOrigemId: origemId,
          colunaOrigem: eq.leftColumn,
          tabelaDestinoId: destinoId,
          colunaDestino: eq.rightColumn,
          tipoJoin: rel.tipoJoin,
          origem: ORIGEM,
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
  });
};
