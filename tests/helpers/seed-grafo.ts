import type { GrafoRepositoryPort } from "../../src/domain/ports/grafo-repository.port.js";

export const seedTabelaComColunas = async (
  grafo: GrafoRepositoryPort,
  input: {
    acessoId: string;
    usuarioId: string;
    nome: string;
    colunas?: readonly string[];
  },
): Promise<void> => {
  const { tabela } = await grafo.mergeTabela({
    acessoId: input.acessoId,
    nome: input.nome,
    origem: "validado_execucao",
    autorUsuarioId: input.usuarioId,
  });
  for (const nome of input.colunas ?? ["codprod"]) {
    await grafo.mergeColuna({
      acessoId: input.acessoId,
      tabelaId: tabela.id,
      nome,
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: input.usuarioId,
    });
  }
};
