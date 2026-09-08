import type { PoliticaConsulta } from "../../../domain/entities/politica-consulta.js";
import {
  aliasesMetricas,
  type ConsultaSemantica,
} from "../../../domain/entities/consulta-semantica.js";
import type { RecomendacaoConsulta } from "./assert-orcamento.js";
import { recomendacoesDeOrcamento } from "./assert-orcamento.js";
import type { SqlAstSelect } from "./sql-ast.js";

export type OrigemConsulta = "sql" | "semantica" | "aprendida" | "modelo";

export interface PlanoConsulta {
  readonly origem: OrigemConsulta;
  readonly dialeto: string;
  /** Política efetivamente combinada das skills publicadas desta consulta. */
  readonly politicaAplicada: PoliticaConsulta | null;
  readonly skillIds: readonly string[];
  readonly tabelas: readonly string[];
  readonly agregado: boolean;
  readonly metricas: readonly string[];
  readonly dimensoes: readonly string[];
  readonly filtros: readonly string[];
  readonly paginacao: {
    readonly modo: "unica" | "pagina";
    readonly maxRows: number;
    readonly page?: number;
    readonly pageSize?: number;
  };
  readonly recomendacoes: readonly RecomendacaoConsulta[];
}

/**
 * Plano comum de preflight. ConsultarDados e ValidarConsulta usam a mesma
 * representação, garantindo que o dry-run e a execução exibam o mesmo
 * recorte, orçamento e recomendações sem incluir SQL ou parâmetros.
 */
export const montarPlanoConsulta = (input: {
  origem: OrigemConsulta;
  dialeto: string;
  skillIds: readonly string[];
  tabelas: readonly string[];
  ast: SqlAstSelect | null;
  consultaSemantica?: ConsultaSemantica | null;
  maxRows: number;
  politica: PoliticaConsulta | null;
  maxRowsSolicitado?: number;
  paginacao?: {
    page?: number;
    pageSize?: number;
  };
}): PlanoConsulta => {
  const page = input.paginacao?.page;
  const pageSize = input.paginacao?.pageSize;
  const paginada = page != null && pageSize != null;
  return {
    origem: input.origem,
    dialeto: input.dialeto,
    politicaAplicada: input.politica ? { ...input.politica } : null,
    skillIds: [...input.skillIds],
    tabelas: [...input.tabelas],
    agregado: Boolean(input.ast?.temAgregacao),
    metricas: [...(input.consultaSemantica ? aliasesMetricas(input.consultaSemantica) : [])],
    dimensoes: [...(input.consultaSemantica?.dimensoes ?? [])],
    filtros: [...(input.consultaSemantica?.filtros?.map((item) => item.coluna) ?? [])],
    paginacao: paginada
      ? { modo: "pagina", maxRows: input.maxRows, page, pageSize }
      : { modo: "unica", maxRows: input.maxRows },
    recomendacoes: recomendacoesDeOrcamento({
      ast: input.ast,
      politica: input.politica,
      maxRows: input.maxRowsSolicitado ?? input.maxRows,
    }),
  };
};
