import { RANKING_CUTOFF_GUIDANCE } from "./sql-summary-guidance.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import { guiaDialeto, type GuiaDialeto } from "../use-cases/shared/guia-dialeto.js";
import { PERSONA_DIALECT_EXAMPLES } from "./dialect-examples.js";

/** Public v2 guidance describes the consumer contract, not the upstream wire names. */
export const personaDialectGuide = (
  dialect: Dialeto,
): GuiaDialeto & { examples: readonly { purpose: string; sql: string }[]; exampleScope: string } =>
  dialect !== "firebird"
    ? {
        ...guiaDialeto(dialect),
        examples: PERSONA_DIALECT_EXAMPLES[dialect],
        exampleScope:
          "Fixture sintética fixture_sales: sold_at e net_amount. Parâmetros start/end separados, início inclusivo/fim exclusivo no calendário publicado. Validação local não comprova execução no motor, significado comercial ou concessão. Não presuma esse schema na fonte conectada.",
        paginacao: `Comece com options.page = 1 e options.pageSize inteiro positivo. Use ORDER BY por aliases simples projetados, com desempate estável no grão da linha. Não combine paginação gerenciada com TOP, LIMIT, OFFSET, FETCH ou START AT. ${RANKING_CUTOFF_GUIDANCE} Só avance quando pagination.hasNextPage for true e ainda precisar de linhas; conserve o tamanho efetivo pagination.pageSize, a ordenação, os filtros e os parâmetros. completeness.truncated não indica próxima página. Em leitura sem pagination, confira completeness.complete: true confirma o resultado do recorte executado; false exige informar a limitação. Só use hasNextPage quando houver pagination. Em falha, preserve o supportId e não troque paginação por um corte no SQL para contornar a recusa.`,
        limite:
          "SELECT adaptável com projeção explícita e colunas publicadas; SELECT * não é permitido. Para uma página, use options.page e options.pageSize com ORDER BY, sem corte explícito; uma página não representa o total. Leia completeness e provenance." +
          (dialect === "mssql"
            ? " COUNT_BIG(*) e COUNT_BIG(expressão) preservam bigint; DISTINCT/ALL explícitos ainda não são aceitos. Em JOIN, use COUNT_BIG(alias.chave) não nula da origem publicada quando esse for o grão desejado; estrela não comprova origem. Contagem de expressão ignora NULL. Não substitua por SUM(1) nem remova vínculos para contornar AGREGACAO_INSEGURA. A função não concede acesso novo. Exemplo sintético: vendas v N:1 tipos t com chave completa (empresa,tipo): para contar vendas, COUNT_BIG(v.id) com id não nula explicita a origem; COUNT_BIG(t.id) conta uma coluna da dimensão multiplicável, e COUNT_BIG(*) não explicita origem. A chave simples só é equivalente a contar linhas se não nula no conjunto contado; LEFT JOIN, nulos e outro grão exigem revisão semântica. Não crie CONCAT de chave composta, DISTINCT ou filtros adicionais para forçar aceitação. EXISTS com chave completa só vale se o caminho publicado, os filtros e o validador permitirem; sua sugestão não comprova equivalência nem autorização."
            : ""),
      }
    : (() => {
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Firebird não é suportado.");
      })();
