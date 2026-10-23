import { z } from "zod";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { assertLibrarySize } from "./knowledge-library-schema.js";
import { structureContentSchema } from "../../domain/persona-v2/structure-content-schema.js";
// A missing declared PK is retained for human review; all other structural limits still apply.
const declarationSchema = structureContentSchema.extend({
  tables: z
    .array(
      structureContentSchema.shape.tables.element.extend({
        grain: z
          .array(structureContentSchema.shape.tables.element.shape.columns.element.shape.name)
          .max(32),
      }),
    )
    .min(1)
    .max(64),
});
const inputSchema = z.strictObject({
  system: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(100),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  ddl: z.string().min(1).max(51200),
});
interface Token {
  value: string;
  kind: "word" | "number" | "identifier" | "symbol";
}
type Table = StructureContent["tables"][number];
type Column = Table["columns"][number];
interface DeclaredTable {
  id: string;
  name: string;
  columns: Column[];
  keys: NonNullable<Table["keys"]>[number][];
}
interface ForeignKey {
  name?: string;
  from: string;
  columns: string[];
  to: string;
  target: string[];
}
function fail(): never {
  throw new PersonaV2Error(
    "INVALID_PLAN",
    "DDL fora da gramática estrutural suportada. Use tabelas, colunas, PK/UNIQUE/FK e nomes canônicos; nenhum comando é executado.",
  );
}
/** Closed lexical grammar. No native parser, execution, interpolation or partial acceptance. */
function tokenize(sql: string): Token[] {
  const result: Token[] = [];
  let at = 0;
  while (at < sql.length) {
    const rest = sql.slice(at);
    if (/^\s/.test(rest)) {
      at++;
      continue;
    }
    if (rest.startsWith("--")) {
      const end = rest.indexOf("\n");
      at += end < 0 ? rest.length : end + 1;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      if (end < 0 || rest.slice(2, end).includes("/*")) {
        fail();
      }
      at += end + 2;
      continue;
    }
    const quoted = /^(?:"([a-zA-Z_][a-zA-Z0-9_$]*)"|\[([a-zA-Z_][a-zA-Z0-9_$]*)\])/.exec(rest);
    if (quoted) {
      result.push({ value: quoted[1] ?? quoted[2]!, kind: "identifier" });
      at += quoted[0].length;
      continue;
    }
    const word = /^[a-zA-Z_][a-zA-Z0-9_$]*/.exec(rest);
    if (word) {
      result.push({ value: word[0], kind: "word" });
      at += word[0].length;
      continue;
    }
    const number = /^\d+/.exec(rest);
    if (number) {
      result.push({ value: number[0], kind: "number" });
      at += number[0].length;
      continue;
    }
    if (/^[(),.;]/.test(rest)) {
      result.push({ value: rest[0]!, kind: "symbol" });
      at++;
      continue;
    }
    fail();
  }
  if (result.length > 10000) {
    fail();
  }
  return result;
}
export interface StructuralDdlImport {
  content: StructureContent;
  ddlHash: string;
  warnings: string[];
  technicalEvidence: false;
  semanticReview: false;
}
export function importStructuralDdl(raw: unknown, crypto: CryptoPort): StructuralDdlImport {
  assertLibrarySize(raw);
  const input = inputSchema.parse(raw),
    tokens = tokenize(input.ddl);
  let pos = 0;
  const tables: DeclaredTable[] = [],
    foreign: ForeignKey[] = [];
  const constraintNames = new Map<string, Set<string>>();
  const anonymousKeys = new Set<NonNullable<Table["keys"]>[number]>();
  const accept = (word: string): boolean => {
    const t = tokens[pos];
    if (t && t.kind !== "identifier" && t.value.toUpperCase() === word) {
      pos++;
      return true;
    }
    return false;
  };
  const need = (word: string) => {
    if (!accept(word)) {
      fail();
    }
  };
  const identifier = (): string => {
    const t = tokens[pos++];
    if (!t || !["word", "identifier"].includes(t.kind) || !/^[a-z_][a-z0-9_$]*$/.test(t.value)) {
      fail();
    }
    return t.value;
  };
  const name = (): string => {
    const first = identifier();
    return accept(".") ? first + "." + identifier() : first;
  };
  const keyList = (): string[] => {
    need("(");
    const cols = [identifier()];
    while (accept(",")) {
      cols.push(identifier());
    }
    need(")");
    if (cols.length > 32 || new Set(cols).size !== cols.length) {
      fail();
    }
    return cols;
  };
  const key = (
    table: DeclaredTable,
    kind: "primary" | "unique",
    columns: string[],
    constraint?: string,
  ) => {
    const declared: NonNullable<Table["keys"]>[number] = {
      id: constraint ?? `key_${table.keys.length + 1}`,
      kind,
      columns,
      status: "unknown",
    };
    table.keys.push(declared);
    if (!constraint) {
      anonymousKeys.add(declared);
    }
  };
  const reference = (table: DeclaredTable, columns: string[], constraint?: string) => {
    need("REFERENCES");
    foreign.push({ name: constraint, from: table.name, columns, to: name(), target: keyList() });
  };
  const constraint = (table: DeclaredTable, columnName?: string): boolean => {
    let constraintName: string | undefined;
    if (accept("CONSTRAINT")) {
      constraintName = identifier();
      const names = constraintNames.get(table.name) ?? new Set<string>();
      if (names.has(constraintName)) {
        fail();
      }
      names.add(constraintName);
      constraintNames.set(table.name, names);
    }
    if (accept("PRIMARY")) {
      need("KEY");
      key(table, "primary", columnName ? [columnName] : keyList(), constraintName);
      return true;
    }
    if (accept("UNIQUE")) {
      key(table, "unique", columnName ? [columnName] : keyList(), constraintName);
      return true;
    }
    if (!columnName && accept("FOREIGN")) {
      need("KEY");
      reference(table, keyList(), constraintName);
      return true;
    }
    if (
      columnName &&
      tokens[pos]?.kind === "word" &&
      tokens[pos]?.value.toUpperCase() === "REFERENCES"
    ) {
      reference(table, [columnName], constraintName);
      return true;
    }
    if (constraintName) {
      fail();
    }
    return false;
  };
  const nativeType = (): NonNullable<Column["nativeTypes"]>[number] => {
    const t = tokens[pos++];
    if (t?.kind !== "word") {
      fail();
    }
    let type = t.value.toLowerCase();
    const common = [
      "smallint",
      "integer",
      "int",
      "bigint",
      "decimal",
      "numeric",
      "real",
      "float",
      "double",
      "char",
      "varchar",
      "character",
      "date",
      "time",
      "timestamp",
    ];
    const own: Record<typeof input.dialect, string[]> = {
      postgres: ["int2", "int4", "int8", "text", "boolean", "bool", "uuid", "bytea", "timestamptz"],
      mssql: [
        "tinyint",
        "bit",
        "nchar",
        "nvarchar",
        "datetime",
        "datetime2",
        "smalldatetime",
        "uniqueidentifier",
        "money",
        "smallmoney",
        "varbinary",
      ],
      sybase: ["tinyint", "bit", "long", "binary", "datetime", "varbinary", "uniqueidentifier"],
    };
    if (!common.includes(type) && !own[input.dialect].includes(type)) {
      fail();
    }
    if (type === "character" && accept("VARYING")) {
      type = "character varying";
    }
    if (type === "double") {
      need("PRECISION");
      type = "double precision";
    }
    const native: NonNullable<Column["nativeTypes"]>[number] = { dialect: input.dialect, type };
    if (accept("(")) {
      const first = tokens[pos++];
      if (first?.kind !== "number") {
        fail();
      }
      const n = Number(first.value);
      if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) {
        fail();
      }
      if (["decimal", "numeric"].includes(type)) {
        const scale = accept(",") ? tokens[pos++] : undefined;
        if (scale && scale.kind !== "number") {
          fail();
        }
        const s = scale ? Number(scale.value) : 0;
        if (n > 1000 || s > n) {
          fail();
        }
        Object.assign(native, { precision: n, scale: s });
      } else if (
        [
          "char",
          "varchar",
          "nchar",
          "nvarchar",
          "character",
          "character varying",
          "binary",
          "varbinary",
        ].includes(type)
      ) {
        Object.assign(native, { length: n });
      } else {
        fail();
      }
      need(")");
    }
    return native;
  };
  while (pos < tokens.length) {
    if (accept("CREATE")) {
      need("TABLE");
      const tableName = name();
      if (
        tables.some((t) => t.name === tableName) ||
        tables.length >= 64 ||
        tableName.split(".").at(-1) === "se7e_source_identity"
      ) {
        fail();
      }
      const table: DeclaredTable = {
        id: `ddl_${crypto.sha256Hex(tableName).slice(0, 16)}`,
        name: tableName,
        columns: [],
        keys: [],
      };
      tables.push(table);
      need("(");
      do {
        if (constraint(table)) {
          continue;
        }
        const columnName = identifier();
        if (table.columns.some((c) => c.name === columnName) || table.columns.length >= 1024) {
          fail();
        }
        const native = nativeType();
        let nullable = true;
        if (accept("NOT")) {
          need("NULL");
          nullable = false;
        } else {
          accept("NULL");
        }
        while (constraint(table, columnName)) {
          // Multiple declarative constraints preserve their names; none is executed.
        }
        table.columns.push({
          name: columnName,
          meaning: "Declaração importada; significado pendente de revisão.",
          logicalType:
            native.precision !== undefined
              ? `${native.type}(${native.precision},${native.scale ?? 0})`
              : native.length !== undefined
                ? `${native.type}(${native.length})`
                : native.type,
          nullable,
          classification: "inferido",
          nativeTypes: [native],
        });
      } while (accept(","));
      need(")");
    } else if (accept("ALTER")) {
      need("TABLE");
      const tableName = name();
      const table = tables.find((t) => t.name === tableName);
      if (!table) {
        fail();
      }
      need("ADD");
      if (!constraint(table)) {
        fail();
      }
    } else {
      fail();
    }
    if (pos < tokens.length && !accept(";") && !(input.dialect === "mssql" && accept("GO"))) {
      fail();
    }
    while (accept(";")) {
      /* Empty separators have no executable content. */
    }
    if (input.dialect === "mssql") {
      accept("GO");
    }
  }
  if (!tables.length) {
    fail();
  }
  const warnings = [
    "Declarações importadas não são prova técnica nem revisão semântica. Campos permanecem inferidos; inspecione pelo hub/agente antes da adoção executável.",
  ];
  for (const table of tables) {
    const usedNames = new Set(constraintNames.get(table.name));
    let nextKeyId = 1;
    table.keys = table.keys.map((declared) => {
      if (anonymousKeys.has(declared)) {
        while (usedNames.has(`key_${nextKeyId}`)) {
          nextKeyId++;
        }
        const id = `key_${nextKeyId++}`;
        usedNames.add(id);
        return { ...declared, id };
      }
      return declared;
    });
    const primary = table.keys.find((k) => k.kind === "primary");
    table.columns = table.columns.map((c) =>
      primary?.columns.includes(c.name) ? { ...c, nullable: false } : c,
    );
    if (
      !table.columns.length ||
      table.keys.filter((k) => k.kind === "primary").length > 1 ||
      new Set(table.keys.map((k) => k.id)).size !== table.keys.length
    ) {
      fail();
    }
    for (const k of table.keys) {
      if (k.columns.some((c) => !table.columns.some((col) => col.name === c))) {
        fail();
      }
    }
    if (!table.keys.some((k) => k.kind === "primary")) {
      warnings.push(
        `Defina explicitamente o grão de ${table.name} antes de salvar como padrão/template.`,
      );
    }
  }
  const relationships: StructureContent["relationships"][number][] = foreign.map((fk, index) => {
    const from = tables.find((t) => t.name === fk.from)!,
      to = tables.find((t) => t.name === fk.to);
    if (
      !to ||
      fk.columns.length !== fk.target.length ||
      fk.columns.length > 16 ||
      fk.columns.some((c) => !from.columns.some((col) => col.name === c)) ||
      fk.target.some((c) => !to.columns.some((col) => col.name === c))
    ) {
      fail();
    }
    return {
      id: `fk_${index + 1}`,
      from: from.id,
      to: to.id,
      keys: fk.columns.map((c, i) => ({ from: c, to: fk.target[i]! })),
      join: "left",
      cardinality: "N:1",
      optional: fk.columns.some((c) => from.columns.find((col) => col.name === c)!.nullable),
      meaning:
        "Associação declarada no arquivo; cardinalidade e significado exigem revisão e prova da restrição.",
      via: [],
      origin: "database",
      constraintStatus: "unknown",
      ...(fk.name ? { constraintName: fk.name } : {}),
    };
  });
  if (relationships.length > 128) {
    fail();
  }
  const content: StructureContent = {
    system: input.system,
    label: input.label,
    dialects: [input.dialect],
    tables: tables.map((t) => ({
      ...t,
      resourceType: "table",
      meaning: "Estrutura declarada; significado pendente.",
      grain: t.keys.find((k) => k.kind === "primary")?.columns ?? [],
      physicalNames: [{ dialect: input.dialect, name: t.name }],
    })),
    relationships,
    examples: [],
    rules: [
      "Material importado de DDL. Não prova existência, enforcement, significado ou autorização.",
    ],
  };
  if (!declarationSchema.safeParse(content).success) {
    fail();
  }
  return {
    content,
    ddlHash: crypto.sha256Hex(input.ddl),
    warnings,
    technicalEvidence: false,
    semanticReview: false,
  };
}
