import type { AnotacaoGrafo } from "../../../domain/entities/skill.js";
import { scoreStemOverlap, stemsDeTexto } from "../../../domain/entities/stem-portugues.js";

export const AVISOS_REGRA_TETO = 3;

export interface AvisoConsulta {
  readonly code: string;
  readonly message: string;
}

export const tabelaDaNotaNoSql = (
  tabelaId: string | null,
  tabelasSql: ReadonlySet<string>,
  tabelaNomePorId: ReadonlyMap<string, string>,
): boolean => {
  if (!tabelaId) {
    return false;
  }
  const nome = tabelaNomePorId.get(tabelaId);
  return nome ? tabelasSql.has(nome.toLowerCase()) : false;
};

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
  if (nota.skillId && !skillIds.has(nota.skillId)) {
    return false;
  }
  if (nota.tabelaId) {
    return tabelaDaNotaNoSql(nota.tabelaId, tabelasSql, tabelaNomePorId);
  }
  return Boolean(nota.skillId);
};

const haystackSql = (tabelasSql: ReadonlySet<string>, aliasesSql: readonly string[]): string =>
  [...tabelasSql, ...aliasesSql].join(" ");

export const coletarAvisosAnotacaoConsulta = (input: {
  readonly notas: readonly AnotacaoGrafo[];
  readonly skillIds: ReadonlySet<string>;
  readonly tabelasSql: ReadonlySet<string>;
  readonly tabelaNomePorId: ReadonlyMap<string, string>;
  readonly aliasesSql?: readonly string[];
}): AvisoConsulta[] => {
  const aliasesSql = input.aliasesSql ?? [];
  const termosSql = stemsDeTexto(haystackSql(input.tabelasSql, aliasesSql));
  const regras: AnotacaoGrafo[] = [];
  const metricas: AvisoConsulta[] = [];
  for (const nota of input.notas) {
    if (!anotacaoEntraNoEnvelopeConsulta({ nota, ...input })) {
      continue;
    }
    if (nota.tipo === "metrica") {
      metricas.push({
        code: "METRICA",
        message: `${nota.titulo}: ${nota.texto}`,
      });
      continue;
    }
    regras.push(nota);
  }
  const ranked = regras
    .map((nota, index) => ({
      nota,
      index,
      score: scoreStemOverlap(`${nota.titulo} ${nota.texto}`, termosSql),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .slice(0, AVISOS_REGRA_TETO)
    .map(({ nota }) => ({
      code: "REGRA" as const,
      message: `${nota.titulo}: ${nota.texto}`,
    }));
  return [...metricas, ...ranked];
};
