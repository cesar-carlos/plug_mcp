import { relacoesSemSubconjuntos } from "../../../domain/entities/relacionamento.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";

export const podarRelacionamentosSubsetNoGrafo = async (
  grafo: GrafoRepositoryPort,
  acessoId: string,
): Promise<void> => {
  const tabelas = await grafo.listTabelas(acessoId);
  const nomeById = new Map(tabelas.map((tabela) => [tabela.id, tabela.nome]));
  const rels = await grafo.listRelacionamentos(acessoId);
  const mapped = rels.map((rel) => ({
    id: rel.id,
    tabelaOrigem: nomeById.get(rel.tabelaOrigemId) ?? "",
    tabelaDestino: nomeById.get(rel.tabelaDestinoId) ?? "",
    pares: rel.pares,
  }));
  const keep = new Set(relacoesSemSubconjuntos(mapped).map((rel) => rel.id));
  for (const rel of mapped) {
    if (!keep.has(rel.id) && rel.tabelaOrigem && rel.tabelaDestino) {
      await grafo.deleteRelacionamento(acessoId, rel.id);
    }
  }
};
