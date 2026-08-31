import type { AnotacaoGrafo } from "../../../domain/entities/skill.js";

export const AVISOS_REGRA_TETO = 3;

export interface AvisoConsulta {
  readonly code: string;
  readonly message: string;
}

export const anotacaoEntraNoEnvelopeConsulta = (input: {
  readonly nota: AnotacaoGrafo;
  readonly skillIds: ReadonlySet<string>;
  readonly tabelasSql: ReadonlySet<string>;
  readonly tabelaNomePorId: ReadonlyMap<string, string>;
}): boolean => {
  const { nota, skillIds, tabelasSql, tabelaNomePorId } = input;
  if (nota.tipo !== "regra" && nota.tipo !== "metrica") {
    return false;
  }
  if (nota.skillId) {
    return skillIds.has(nota.skillId);
  }
  if (nota.tabelaId) {
    const nome = tabelaNomePorId.get(nota.tabelaId);
    return nome ? tabelasSql.has(nome.toLowerCase()) : false;
  }
  return false;
};

export const coletarAvisosAnotacaoConsulta = (input: {
  readonly notas: readonly AnotacaoGrafo[];
  readonly skillIds: ReadonlySet<string>;
  readonly tabelasSql: ReadonlySet<string>;
  readonly tabelaNomePorId: ReadonlyMap<string, string>;
}): AvisoConsulta[] => {
  const regras: AvisoConsulta[] = [];
  const metricas: AvisoConsulta[] = [];
  for (const nota of input.notas) {
    if (!anotacaoEntraNoEnvelopeConsulta({ nota, ...input })) {
      continue;
    }
    const aviso: AvisoConsulta = {
      code: nota.tipo.toUpperCase(),
      message: `${nota.titulo}: ${nota.texto}`,
    };
    if (nota.tipo === "metrica") {
      metricas.push(aviso);
    } else {
      regras.push(aviso);
    }
  }
  return [...metricas, ...regras.slice(0, AVISOS_REGRA_TETO)];
};
