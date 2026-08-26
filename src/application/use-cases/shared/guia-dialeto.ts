import type { Dialeto } from "../../../domain/entities/dialeto.js";

export interface GuiaDialeto {
  readonly dialeto: Dialeto;
  readonly paginacao: string;
  readonly data: string;
  readonly concatenacao: string;
  readonly cast: string;
  readonly limite: string;
}

const GUIAS: Record<Exclude<Dialeto, "firebird">, Omit<GuiaDialeto, "dialeto">> = {
  mssql: {
    paginacao:
      "Consulta única limitada: SELECT TOP n ... ORDER BY ... (sem options.page). Paginação de páginas: só ORDER BY no SQL + options.page e options.page_size juntos — não escreva TOP/OFFSET/FETCH",
    data: "YEAR(col), MONTH(col), DATEADD, DATEDIFF, CONVERT(date, col), GETDATE()",
    concatenacao: "col1 + col2 ou CONCAT(col1, col2)",
    cast: "CAST(x AS DECIMAL(18,2)), CONVERT(varchar, x)",
    limite: "TOP n no SELECT; evite SELECT sem WHERE nem agregação",
  },
  sybase: {
    paginacao:
      "Consulta única limitada: SELECT TOP n ... ORDER BY ... (START AT só sem options.page). Paginação de páginas: só ORDER BY no SQL + options.page e options.page_size juntos — não escreva TOP/START AT",
    data: "YEAR(col), MONTH(col), DATEADD, DATEDIFF, CAST(col AS DATE), CURRENT DATE, GETDATE()",
    concatenacao: "col1 || col2 ou STRING(col1, col2)",
    cast: "CAST(x AS DECIMAL(18,2)), CONVERT(varchar, x)",
    limite: "TOP n; evite SELECT sem WHERE nem agregação",
  },
  postgres: {
    paginacao:
      "Consulta única limitada: LIMIT n (sem options.page). Paginação de páginas: só ORDER BY no SQL + options.page e options.page_size juntos — não escreva LIMIT/OFFSET",
    data: "date_trunc('month', col), EXTRACT(YEAR FROM col), col::date, NOW(), CURRENT_DATE",
    concatenacao: "col1 || col2 ou CONCAT(col1, col2)",
    cast: "x::numeric(18,2), CAST(x AS text)",
    limite: "LIMIT n; evite SELECT sem WHERE nem agregação",
  },
};

export const guiaDialeto = (dialeto: Dialeto): GuiaDialeto => {
  if (dialeto === "firebird") {
    return {
      dialeto,
      paginacao:
        "Consulta única limitada: SELECT FIRST n ... (só na consulta exemplo). SQL livre e paginação via options.page não estão habilitados neste dialeto",
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
