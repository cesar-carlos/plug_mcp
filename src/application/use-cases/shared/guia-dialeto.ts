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
      "SELECT TOP n ... ; paginação estável: ORDER BY ... OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY",
    data: "YEAR(col), MONTH(col), DATEADD, DATEDIFF, CONVERT(date, col), GETDATE()",
    concatenacao: "col1 + col2 ou CONCAT(col1, col2)",
    cast: "CAST(x AS DECIMAL(18,2)), CONVERT(varchar, x)",
    limite: "TOP n no SELECT; evite SELECT sem WHERE nem agregação",
  },
  sybase: {
    paginacao: "SELECT TOP n ... ; SQL Anywhere também aceita START AT. Prefira TOP + ORDER BY",
    data: "YEAR(col), MONTH(col), DATEADD, DATEDIFF, CAST(col AS DATE), CURRENT DATE, GETDATE()",
    concatenacao: "col1 || col2 ou STRING(col1, col2)",
    cast: "CAST(x AS DECIMAL(18,2)), CONVERT(varchar, x)",
    limite: "TOP n; evite SELECT sem WHERE nem agregação",
  },
  postgres: {
    paginacao: "LIMIT n OFFSET m. Sempre ORDER BY na listagem paginada",
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
      paginacao: "SELECT FIRST n ... ; SQL livre não está habilitado neste dialeto",
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
