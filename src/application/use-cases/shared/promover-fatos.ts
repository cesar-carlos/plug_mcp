import type { OrigemFato } from "../../../domain/entities/grafo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { escopoFromSqlModelo } from "./escopo-from-modelo.js";
import type { SqlModelo } from "./sql-modelo.js";

const ORIGEM: OrigemFato = "validado_execucao";

export const promoverFatosDaExecucao = async (input: {
  grafo: GrafoRepositoryPort;
  agentId: string;
  autorUsuarioId: string;
  modelo: SqlModelo;
}): Promise<void> => {
  const escopo = escopoFromSqlModelo(input.modelo);
  await input.grafo.withAgentLock(input.agentId, async () => {
    const tabelaIds = new Map<string, string>();
    for (const nome of escopo.tabelas) {
      const merged = await input.grafo.mergeTabela({
        agentId: input.agentId,
        nome,
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
      tabelaIds.set(nome.toLowerCase(), merged.tabela.id);
    }
    for (const [tabelaNome, colunas] of Object.entries(escopo.colunasPorTabela)) {
      const tabelaId = tabelaIds.get(tabelaNome.toLowerCase());
      if (!tabelaId) {
        continue;
      }
      for (const coluna of colunas) {
        await input.grafo.mergeColuna({
          tabelaId,
          nome: coluna,
          origem: ORIGEM,
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
    for (const rel of escopo.relacionamentos) {
      const origemId = tabelaIds.get(rel.tabelaOrigem.toLowerCase());
      const destinoId = tabelaIds.get(rel.tabelaDestino.toLowerCase());
      if (!origemId || !destinoId) {
        continue;
      }
      await input.grafo.mergeColuna({
        tabelaId: origemId,
        nome: rel.colunaOrigem,
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
      await input.grafo.mergeColuna({
        tabelaId: destinoId,
        nome: rel.colunaDestino,
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
      await input.grafo.mergeRelacionamento({
        agentId: input.agentId,
        tabelaOrigemId: origemId,
        colunaOrigem: rel.colunaOrigem,
        tabelaDestinoId: destinoId,
        colunaDestino: rel.colunaDestino,
        tipoJoin: rel.tipoJoin,
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
    }
  });
};
