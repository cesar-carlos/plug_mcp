import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import { guiaDialeto, type GuiaDialeto } from "../use-cases/shared/guia-dialeto.js";

/** Public v2 guidance describes the consumer contract, not the upstream wire names. */
export const personaDialectGuide = (dialect: Dialeto): GuiaDialeto =>
  dialect !== "firebird"
    ? {
        ...guiaDialeto(dialect),
        paginacao:
          "Comece com options.page = 1 e options.pageSize inteiro positivo. Use ORDER BY por aliases simples projetados, com desempate estável no grão da linha. Não combine paginação gerenciada com TOP, LIMIT, OFFSET, FETCH ou START AT. Para os primeiros N, pare ao reunir N linhas na ordem solicitada. Só avance quando pagination.hasNextPage for true e ainda precisar de linhas; conserve o tamanho efetivo pagination.pageSize, a ordenação, os filtros e os parâmetros. completeness.truncated não indica próxima página. Sem metadados de paginação, informe a cobertura parcial. Em falha, preserve o supportId e não troque paginação por um corte no SQL para contornar a recusa.",
        limite:
          "SELECT adaptável com projeção explícita e colunas publicadas; SELECT * não é permitido. Para uma página, use options.page e options.pageSize com ORDER BY, sem corte explícito; uma página não representa o total. Leia completeness e provenance.",
      }
    : (() => {
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Firebird não é suportado.");
      })();
