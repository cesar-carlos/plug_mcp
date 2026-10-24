export type DatasetLogicalType =
  "string" | "integer" | "decimal" | "number" | "boolean" | "date" | "datetime";

/** Closed logical types, independent of native dialect aliases or automatic SQL conversion. */
export function datasetLogicalType(type: string): DatasetLogicalType | null {
  const value = type.trim().toLowerCase();
  if (/^(?:string|text|char|varchar|nchar|nvarchar)(?:\(\d+\))?$/.test(value)) {
    return stringLengthDeclaration(value) !== false ? "string" : null;
  }
  if (["integer", "int", "smallint", "bigint"].includes(value)) {
    return "integer";
  }
  if (/^(?:decimal|numeric)(?:\(\d+(?:,\s*\d+)?\))?$/.test(value)) {
    return decimalFitsLogicalType("0", value) ? "decimal" : null;
  }
  if (["number", "real", "float", "double"].includes(value)) {
    return "number";
  }
  return value === "boolean" || value === "date" || value === "datetime" ? value : null;
}

function stringLengthDeclaration(type: string): number | null | false {
  const declaration = /\((\d+)\)$/.exec(type.trim().toLowerCase());
  if (!declaration) {
    return null;
  }
  const length = Number(declaration[1]);
  return Number.isSafeInteger(length) && length > 0 && length <= 2147483647 ? length : false;
}

/** Logical text length counts Unicode code points, not native bytes or UTF-16 units. */
export function stringFitsLogicalType(value: string, type: string): boolean {
  const length = stringLengthDeclaration(type);
  return length !== false && (length === null || [...value].length <= length);
}

/** Count decimal digits as text: conversion to Number would lose precision. */
export function decimalFitsLogicalType(value: string, type: string): boolean {
  const declaration = /^(?:decimal|numeric)\((\d+)(?:,\s*(\d+))?\)$/.exec(
    type.trim().toLowerCase(),
  );
  if (!declaration) {
    return true;
  }
  const precision = Number(declaration[1]),
    scale = Number(declaration[2] ?? 0);
  if (!Number.isSafeInteger(precision) || precision < 1 || precision > 1000 || scale > precision) {
    return false;
  }
  const [whole = "", fraction = ""] = value.replace(/^-/, "").split(".");
  return whole.replace(/^0+/, "").length <= precision - scale && fraction.length <= scale;
}
