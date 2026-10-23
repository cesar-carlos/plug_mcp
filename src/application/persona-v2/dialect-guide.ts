import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import { guiaDialeto, type GuiaDialeto } from "../use-cases/shared/guia-dialeto.js";

/** Public v2 guidance describes the consumer contract, not the upstream wire names. */
export const personaDialectGuide = (dialect: Dialeto): GuiaDialeto =>
  dialect !== "firebird"
    ? {
        ...guiaDialeto(dialect),
        paginacao: guiaDialeto(dialect)
          .paginacao.replaceAll("options.page_size", "options.pageSize")
          .replaceAll("page_size", "options.pageSize")
          .replaceAll("paginacao.hasNextPage", "pagination.hasNextPage")
          .replaceAll("max_rows", "options.maxRows"),
        limite:
          "SELECT adaptável com projeção explícita e colunas publicadas; SELECT * não é permitido. Para uma página, use options.page e options.pageSize com ORDER BY, sem corte explícito; uma página não representa o total. Leia completeness e provenance.",
      }
    : (() => {
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Firebird não é suportado.");
      })();
