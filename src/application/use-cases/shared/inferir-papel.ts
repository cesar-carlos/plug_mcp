import type { PapelColuna, PerfilColuna } from "../../../domain/entities/escopo.js";

export const inferirFormatoColuna = (
  tipo: string | null,
  perfil?: PerfilColuna | null,
): "date" | "number" | null => {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("date") || t.includes("time") || t.includes("timestamp")) {
    return "date";
  }
  if (
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("money") ||
    t.includes("int") ||
    t.includes("float") ||
    t.includes("real") ||
    t.includes("double") ||
    t.includes("number")
  ) {
    return "number";
  }
  const amostra = perfil?.min ?? perfil?.max;
  if (amostra == null) {
    return null;
  }
  if (typeof amostra === "number" && Number.isFinite(amostra)) {
    return "number";
  }
  const text = String(amostra);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return "date";
  }
  if (text !== "" && Number.isFinite(Number(text))) {
    return "number";
  }
  return null;
};

export const inferirPapelColuna = (nome: string, tipo: string | null): PapelColuna => {
  const n = nome.toLowerCase();
  const t = (tipo ?? "").toLowerCase();
  if (/(^cod|id$|_id$|codigo)/.test(n) && !/nome|descr/.test(n)) {
    return n.includes("empresa") || n.includes("filial") || /(^id$|codigo$)/.test(n)
      ? "chave"
      : "codigo";
  }
  if (/data|dt[^a-z]|_at$|venc|emiss/.test(n) || t.includes("date") || t.includes("time")) {
    return "data";
  }
  if (
    /valor|saldo|qtd|quant|total|preco|percent|taxa/.test(n) ||
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("money")
  ) {
    return "medida";
  }
  return "dimensao";
};
