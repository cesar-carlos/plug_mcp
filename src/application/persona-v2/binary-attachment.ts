import type { SqlColumnMetadata } from "../../domain/ports/plug-server-gateway.port.js";
import type { SqlAstSelect } from "../use-cases/shared/sql-ast.js";
import type { BinaryAttachmentContract } from "../../domain/persona-v2/attachments.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** ODBC SQL_BINARY/VARBINARY/LONGVARBINARY; never infer a file from string contents. */
export function isBinaryColumn(metadata: SqlColumnMetadata): boolean {
  const native =
    /^(?:bytea|image|blob|binary|varbinary|long\s+binary)(?:\s*\(\s*(?:max|\d+)\s*\))?$/i.test(
      metadata.type?.trim() ?? "",
    );
  if (metadata.odbcType !== undefined) {
    const binaryType =
      metadata.typeSystem === "odbc_fast"
        ? metadata.odbcType === 7
        : (metadata.typeSystem === undefined || metadata.typeSystem === "odbc") &&
          [-2, -3, -4].includes(metadata.odbcType);
    return binaryType && (metadata.type === undefined || native);
  }
  return (metadata.typeSystem === undefined || metadata.typeSystem === "odbc") && native;
}
export function assertBinaryProjection(
  ast: SqlAstSelect,
  contract: BinaryAttachmentContract,
): void {
  const column = ast.colunas[0],
    table = ast.tabelas[0];
  if (
    ast.colunas.length !== 1 ||
    ast.tabelas.length !== 1 ||
    !table ||
    table.derived ||
    table.isCte ||
    table.isSubquery ||
    ast.setBranches.length ||
    ast.subqueries.length ||
    ast.temLimite ||
    ast.temGroupBy ||
    ast.temHaving ||
    ast.temAgregacao ||
    (ast.usageRefs?.agrupamento.length ?? 0) > 0 ||
    !ast.temOrderBy ||
    ast.joins.length ||
    !column ||
    column.isExpression ||
    column.isStar ||
    table.nome !== contract.table ||
    column.column?.toLowerCase() !== contract.column ||
    (column.table !== null &&
      column.table.toLowerCase() !== (table.alias ?? table.nome).toLowerCase() &&
      column.table.toLowerCase() !== table.nome)
  ) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Anexo binário exige coluna física publicada e ORDER BY, sem expressão, JOIN, UNION, subconsulta, agrupamento, DISTINCT ou limite SQL.",
    );
  }
}
export function decodeBinaryCell(value: unknown, maxBytes: number): Buffer {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 4 * Math.ceil(maxBytes / 3) ||
    value.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Célula binária ausente, inválida ou acima do limite.",
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64") !== value) {
    throw new PersonaV2Error("INCOMPLETE_INPUT", "Célula binária não canônica ou acima do limite.");
  }
  return bytes;
}
/** Signature selects a download type only; no rendering, conversion or claim of file safety. */
export function binaryMedia(
  bytes: Uint8Array,
  allowed: BinaryAttachmentContract["mimeTypes"],
): {
  mimeType: BinaryAttachmentContract["mimeTypes"][number];
  extension: string;
} {
  const data = Buffer.from(bytes);
  const detected = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? { mimeType: "image/png" as const, extension: "png" }
    : data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? { mimeType: "image/jpeg" as const, extension: "jpg" }
      : data.subarray(0, 5).toString("ascii") === "%PDF-"
        ? { mimeType: "application/pdf" as const, extension: "pdf" }
        : data.subarray(0, 4).toString("ascii") === "RIFF" &&
            data.subarray(8, 12).toString("ascii") === "WEBP"
          ? { mimeType: "image/webp" as const, extension: "webp" }
          : undefined;
  if (detected && allowed.includes(detected.mimeType)) {
    return detected;
  }
  if (allowed.includes("application/octet-stream")) {
    return { mimeType: "application/octet-stream", extension: "bin" };
  }
  throw new PersonaV2Error(
    "INCOMPLETE_INPUT",
    "Tipo do arquivo não está autorizado pelo contrato publicado.",
  );
}
