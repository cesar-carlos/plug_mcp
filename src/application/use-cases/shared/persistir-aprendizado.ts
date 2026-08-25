import type { AnotacaoGrafo, ParametroSkill } from "../../../domain/entities/skill.js";
import type { ConsultaAprendida } from "../../../domain/entities/aprendizado.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import type { AnotacaoGrafoRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";

export const TIPOS_APRENDIZADO = new Set([
  "regra",
  "metrica",
  "glossario",
  "dicionario",
  "sinonimo",
  "uso",
]);

export interface ItemAprendizadoInput {
  readonly tipo?: string;
  readonly titulo?: string;
  readonly texto?: string;
  readonly tabela?: string;
  readonly skillId?: string;
}

export const persistirConsultaExecutada = async (input: {
  aprendizado: AprendizadoRepositoryPort;
  agentId: string;
  skillId: string;
  pergunta: string;
  sql: string;
  paramsContrato: readonly ParametroSkill[];
  autorUsuarioId: string;
}): Promise<ConsultaAprendida> =>
  input.aprendizado.salvarConsulta({
    agentId: input.agentId,
    skillId: input.skillId,
    pergunta: input.pergunta,
    sql: input.sql,
    paramsContrato: input.paramsContrato,
    autorUsuarioId: input.autorUsuarioId,
  });

export const persistirItensAprendizado = async (input: {
  agentId: string;
  autorUsuarioId: string;
  itens: readonly ItemAprendizadoInput[];
  grafo: GrafoRepositoryPort;
  anotacoes: AnotacaoGrafoRepositoryPort;
  aprendizado: AprendizadoRepositoryPort;
}): Promise<{
  anotacoes: AnotacaoGrafo[];
  sinonimos: number;
  avisos: { code: string; message: string }[];
}> => {
  const anotacoes: AnotacaoGrafo[] = [];
  let sinonimos = 0;
  const avisos: { code: string; message: string }[] = [];
  for (const item of input.itens) {
    const tipo = (item.tipo?.trim() ? item.tipo.trim() : "uso").toLowerCase();
    const titulo = item.titulo?.trim() ?? "";
    const texto = item.texto?.trim() ?? "";
    if (!titulo || !texto) {
      avisos.push({
        code: "APRENDIZADO_IGNORADO",
        message: "Item de aprendizado sem titulo ou texto foi ignorado.",
      });
      continue;
    }
    if (!TIPOS_APRENDIZADO.has(tipo)) {
      avisos.push({
        code: "APRENDIZADO_IGNORADO",
        message: `tipo "${tipo}" inválido. Use regra, metrica, glossario, dicionario ou sinonimo.`,
      });
      continue;
    }
    if (tipo === "sinonimo") {
      await input.aprendizado.registrarSinonimo({
        agentId: input.agentId,
        termo: titulo,
        alvoTipo: item.skillId ? "skill" : "termo",
        alvoId: item.skillId?.trim() ? item.skillId.trim() : texto,
      });
      sinonimos += 1;
      continue;
    }
    let tabelaId: string | null = null;
    if (item.tabela?.trim()) {
      const tabela = await input.grafo.findTabelaByNome(input.agentId, item.tabela.trim());
      tabelaId = tabela?.id ?? null;
    }
    const anotacao = await input.anotacoes.create({
      agentId: input.agentId,
      tabelaId,
      tipo,
      titulo,
      texto,
      autorUsuarioId: input.autorUsuarioId,
    });
    anotacoes.push(anotacao);
  }
  return { anotacoes, sinonimos, avisos };
};
