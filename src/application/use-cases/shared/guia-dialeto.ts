import type { Dialeto } from "../../../domain/entities/dialeto.js";

export interface GuiaDialeto {
  readonly dialeto: Dialeto;
  readonly paginacao: string;
  readonly data: string;
  readonly concatenacao: string;
  readonly cast: string;
  readonly limite: string;
}

/** Bloco comum: teto sem página vs próxima página. Não substitui o guia de sintaxe. */
export const GUIA_PAGINACAO_TRUNCATED =
  "truncated = teto max_rows no caminho sem página (resultado parcial). paginacao.hasNextPage = há próxima página — incremente options.page com o mesmo ORDER BY e page_size. Não trate truncated como hasNextPage.";

const withTruncated = (sintaxe: string): string => `${sintaxe}. ${GUIA_PAGINACAO_TRUNCATED}`;

const GUIAS: Record<Exclude<Dialeto, "firebird">, Omit<GuiaDialeto, "dialeto">> = {
  mssql: {
    paginacao: withTruncated(
      "Consulta única limitada: SELECT TOP n ... ORDER BY ... (sem options.page). Paginação de páginas: só ORDER BY no SQL + options.page e options.page_size juntos — não escreva TOP/OFFSET/FETCH. Se o hub devolver 1033, use TOP n sem options.page até o rewrite OFFSET/FETCH no agente",
    ),
    data: "YEAR(col), MONTH(col), DATEADD, DATEDIFF, CONVERT(date, col), GETDATE()",
    concatenacao: "col1 + col2 ou CONCAT(col1, col2)",
    cast: "CAST(x AS DECIMAL(18,2)), CONVERT(varchar, x)",
    limite:
      "TOP n no SELECT; em consultar_dados evite SELECT sem WHERE nem agregação. Inspeção: SELECT TOP n * FROM tabela",
  },
  sybase: {
    paginacao: withTruncated(
      "Consulta única limitada: SELECT TOP n ... ORDER BY ... (START AT só sem options.page). Paginação de páginas: só ORDER BY no SQL + options.page e options.page_size juntos — não escreva TOP/START AT",
    ),
    data: "YEAR(col), MONTH(col), DATEADD, DATEDIFF, CAST(col AS DATE), CURRENT DATE, GETDATE()",
    concatenacao: "col1 || col2 ou STRING(col1, col2)",
    cast: "CAST(x AS DECIMAL(18,2)), CONVERT(varchar, x)",
    limite:
      "TOP n; em consultar_dados evite SELECT sem WHERE nem agregação. Inspeção: SELECT TOP n * FROM tabela",
  },
  postgres: {
    paginacao: withTruncated(
      "Consulta única limitada: LIMIT n (sem options.page). Paginação de páginas: só ORDER BY no SQL + options.page e options.page_size juntos — não escreva LIMIT/OFFSET",
    ),
    data: "date_trunc('month', col), EXTRACT(YEAR FROM col), col::date, NOW(), CURRENT_DATE",
    concatenacao: "col1 || col2 ou CONCAT(col1, col2)",
    cast: "x::numeric(18,2), CAST(x AS text)",
    limite:
      "LIMIT n; em consultar_dados evite SELECT sem WHERE nem agregação. Inspeção: SELECT * FROM tabela LIMIT n",
  },
};

export const guiaDialeto = (dialeto: Dialeto): GuiaDialeto => {
  if (dialeto === "firebird") {
    return {
      dialeto,
      paginacao: withTruncated(
        "Consulta única limitada: SELECT FIRST n ... (só na consulta exemplo). SQL livre e paginação via options.page não estão habilitados neste dialeto; paginacao.hasNextPage não se aplica",
      ),
      data: "EXTRACT, CAST(col AS DATE), CURRENT_TIMESTAMP",
      concatenacao: "col1 || col2",
      cast: "CAST(x AS NUMERIC(18,2))",
      limite: "Use a consulta exemplo da skill (consultar_dados sem sql)",
    };
  }
  const guia = GUIAS[dialeto];
  if (!guia) {
    return {
      dialeto,
      paginacao: "",
      data: "",
      concatenacao: "",
      cast: "",
      limite: "",
    };
  }
  return {
    dialeto,
    paginacao: guia.paginacao,
    data: guia.data,
    concatenacao: guia.concatenacao,
    cast: guia.cast,
    limite: guia.limite,
  };
};
