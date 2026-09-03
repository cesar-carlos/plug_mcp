import type { OrigemFato } from "../../../domain/entities/grafo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import { escopoFromSqlModelo } from "./escopo-from-modelo.js";
import type { SqlModelo } from "./sql-modelo.js";

const ORIGEM: OrigemFato = "validado_execucao";

export const promoverFatosDaExecucao = async (input: {
  grafo: GrafoRepositoryPort;
  acessoId: string;
  autorUsuarioId: string;
  modelo: SqlModelo;
}): Promise<void> => {
  const escopo = escopoFromSqlModelo(input.modelo);
  await input.grafo.withAcessoLock(input.acessoId, async () => {
    const tabelaIds = new Map<string, string>();
    for (const nome of escopo.tabelas) {
      const merged = await input.grafo.mergeTabela({
        acessoId: input.acessoId,
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
          acessoId: input.acessoId,
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
      const pares = paresDoRelacionamento(rel);
      for (const par of pares) {
        await input.grafo.mergeColuna({
          acessoId: input.acessoId,
          tabelaId: origemId,
          nome: par.colunaOrigem,
          origem: ORIGEM,
          autorUsuarioId: input.autorUsuarioId,
        });
        await input.grafo.mergeColuna({
          acessoId: input.acessoId,
          tabelaId: destinoId,
          nome: par.colunaDestino,
          origem: ORIGEM,
          autorUsuarioId: input.autorUsuarioId,
        });
      }
      const first = pares[0];
      if (!first) {
        continue;
      }
      await input.grafo.mergeRelacionamento({
        acessoId: input.acessoId,
        tabelaOrigemId: origemId,
        colunaOrigem: first.colunaOrigem,
        tabelaDestinoId: destinoId,
        colunaDestino: first.colunaDestino,
        pares,
        tipoJoin: rel.tipoJoin,
        origem: ORIGEM,
        autorUsuarioId: input.autorUsuarioId,
      });
    }
  });
};
