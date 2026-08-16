export const TESTAR_SQL_MAX_ROWS = 20;
const MAX_VALORES_UNICOS = 20;
const MAX_CODIGOS_DISTINTOS = 12;
const MAX_TAMANHO_CODIGO = 8;
const MAX_TAMANHO_CODIGO_CURTO = 4;

export interface EstruturaColunaAmostra {
  readonly nome: string;
  readonly tipoInferido: string;
  readonly pareceCodigo: boolean;
  readonly valoresVistos: readonly string[];
}

export interface ColunaCodigoAmostra {
  readonly coluna: string;
  readonly valoresVistos: readonly string[];
}

const isNullish = (value: unknown): boolean => value == null || value === "";

const isDateLike = (value: unknown): boolean => {
  if (value instanceof Date) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^\d{2}\/\d{2}\/\d{4}/.test(trimmed);
};

const stringifyValor = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
};

const uniqueValores = (values: readonly unknown[]): string[] => {
  const seen = new Set<string>();
  for (const value of values) {
    if (isNullish(value)) {
      continue;
    }
    seen.add(stringifyValor(value));
    if (seen.size >= MAX_VALORES_UNICOS) {
      break;
    }
  }
  return [...seen];
};

export const inferirTipoAmostra = (values: readonly unknown[]): string => {
  const nonNull = values.filter((value) => !isNullish(value));
  const first = nonNull[0];
  if (first === undefined) {
    return "unknown";
  }
  if (typeof first === "boolean") {
    return "boolean";
  }
  if (typeof first === "bigint") {
    return "integer";
  }
  if (typeof first === "number") {
    return Number.isInteger(first) ? "integer" : "decimal";
  }
  if (isDateLike(first)) {
    return "datetime";
  }
  if (typeof first === "string") {
    const trimmed = first.trim();
    if (trimmed.length <= 1) {
      return "char";
    }
    if (/^-?\d+\.\d+$/.test(trimmed)) {
      return "decimal";
    }
    return "text";
  }
  return "text";
};

const pareceCodigoValores = (values: readonly unknown[]): boolean => {
  const nonNull = values.filter((value) => !isNullish(value));
  if (nonNull.length === 0) {
    return false;
  }
  if (nonNull.every((value) => typeof value === "boolean")) {
    return true;
  }
  // Flag 0/1 só quando os dois valores aparecem; um único 1 é id (CodEmpresa), não código.
  if (
    nonNull.every(
      (value) =>
        value === 0 ||
        value === 1 ||
        value === 0n ||
        value === 1n ||
        value === "0" ||
        value === "1",
    )
  ) {
    const distinct = new Set(nonNull.map((value) => String(value)));
    return distinct.size >= 2;
  }
  if (nonNull.some((value) => isDateLike(value))) {
    return false;
  }
  if (nonNull.some((value) => typeof value === "number" && !Number.isInteger(value))) {
    return false;
  }
  if (nonNull.every((value) => typeof value === "number" || typeof value === "bigint")) {
    return false;
  }
  const strs = nonNull.map((value) => String(value).trim());
  if (strs.some((item) => item.length > MAX_TAMANHO_CODIGO)) {
    return false;
  }
  if (strs.some((item) => /^-?\d+\.\d+$/.test(item))) {
    return false;
  }
  if (strs.every((item) => /^\d+$/.test(item)) && strs.some((item) => item.length > 1)) {
    return false;
  }
  const unique = new Set(strs);
  if (unique.size > MAX_CODIGOS_DISTINTOS) {
    return false;
  }
  if (strs.every((item) => item.length === 1)) {
    return true;
  }
  return strs.every(
    (item) => item.length <= MAX_TAMANHO_CODIGO_CURTO && /^[A-Za-z0-9_-]+$/.test(item),
  );
};

export const analisarAmostraSql = (
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): { estrutura: EstruturaColunaAmostra[]; colunasCodigo: ColunaCodigoAmostra[] } => {
  const estrutura = columns.map((nome) => {
    const values = rows.map((row) => row[nome]);
    return {
      nome,
      tipoInferido: inferirTipoAmostra(values),
      pareceCodigo: pareceCodigoValores(values),
      valoresVistos: uniqueValores(values),
    };
  });
  return {
    estrutura,
    colunasCodigo: estrutura
      .filter((col) => col.pareceCodigo)
      .map((col) => ({ coluna: col.nome, valoresVistos: col.valoresVistos })),
  };
};

export const montarHintTestarSql = (input: {
  rowCount: number;
  colunasCodigo: readonly ColunaCodigoAmostra[];
}): string => {
  const dicionario =
    "Pergunte o dicionário ao usuário (o que cada letra/número significa). Nunca chute (Status 'A' não é 'Ativo' até o usuário dizer). Grave em colunas[].regraNegocio ou regras[].";
  if (input.colunasCodigo.length > 0) {
    const lista = input.colunasCodigo
      .map((col) => `${col.coluna}=${col.valoresVistos.join(",") || "(vazio)"}`)
      .join("; ");
    return `SQL válido. Colunas com aparência de código: ${lista}. Mostre a amostra. ${dicionario} Se faltar valor no domínio, chame testar_sql com SELECT DISTINCT essa_coluna FROM a mesma tabela. Só então registrar_fonte com confirmado=true.`;
  }
  if (input.rowCount === 0) {
    return "SQL válido (executou), mas não devolveu linhas. Pode ser filtro ou tabela vazia. Mostre as colunas, peça o significado de negócio, e use SELECT DISTINCT se houver campo de status/código. Não invente semântica.";
  }
  return "SQL válido. Mostre colunas, tiposInferidos e a amostra ao usuário. Peça o significado de cada coluna; não invente. Use tipoInferido ao registrar. Depois registrar_fonte com confirmado=true.";
};
