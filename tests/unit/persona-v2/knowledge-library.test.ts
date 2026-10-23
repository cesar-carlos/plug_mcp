import { describe, expect, it } from "vitest";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { importStructuralDdl } from "../../../src/application/persona-v2/structural-ddl.js";
import {
  candidateTemplate,
  datasetPayloadSchema,
  validateDataset,
  templatePayloadSchema,
  templateDraftImportSchema,
} from "../../../src/application/persona-v2/knowledge-library-schema.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
const crypto = new NodeCryptoAdapter("ab".repeat(32));
describe("declarações DDL, sem execução ou prova de estrutura", () => {
  it.each(["postgres", "mssql", "sybase"])(
    "preserva constraints inline nomeadas e múltiplas declarações no dialeto %s",
    (dialect) => {
      const result = importStructuralDdl(
        {
          system: "Fixture",
          label: "v1",
          dialect,
          ddl: `CREATE TABLE parent (id int CONSTRAINT parent_pk PRIMARY KEY);
          CREATE TABLE child (
            id int CONSTRAINT child_pk PRIMARY KEY CONSTRAINT child_parent REFERENCES parent(id),
            code int NOT NULL CONSTRAINT child_code UNIQUE
          );`,
        },
        crypto,
      );
      expect(result.content.tables[1]!.keys).toEqual([
        { id: "child_pk", kind: "primary", columns: ["id"], status: "unknown" },
        { id: "child_code", kind: "unique", columns: ["code"], status: "unknown" },
      ]);
      expect(result.content.tables[1]!.grain).toEqual(["id"]);
      expect(result.content.tables[1]!.columns[0]).toMatchObject({ nullable: false });
      expect(result.content.relationships[0]).toMatchObject({
        constraintName: "child_parent",
        constraintStatus: "unknown",
        keys: [{ from: "id", to: "id" }],
        cardinality: "N:1",
        optional: false,
      });
      expect(result).toMatchObject({ technicalEvidence: false, semanticReview: false });
    },
  );
  it("identificadores gerados não colidem com constraints nomeadas posteriores", () => {
    const result = importStructuralDdl(
      {
        system: "Fixture",
        label: "v1",
        dialect: "postgres",
        ddl: `CREATE TABLE t (id int PRIMARY KEY, code int CONSTRAINT key_1 UNIQUE,
          other int UNIQUE, last int CONSTRAINT key_2 UNIQUE);`,
      },
      crypto,
    );
    expect(result.content.tables[0]!.keys!.map((k) => k.id)).toEqual([
      "key_3",
      "key_1",
      "key_4",
      "key_2",
    ]);
  });
  it.each([
    "CREATE TABLE t (id int CONSTRAINT repeated PRIMARY KEY, code int CONSTRAINT repeated UNIQUE);",
    "CREATE TABLE parent (id int PRIMARY KEY); CREATE TABLE child (id int CONSTRAINT repeated UNIQUE, parent_id int CONSTRAINT repeated REFERENCES parent(id));",
    "CREATE TABLE parent (id int PRIMARY KEY); CREATE TABLE child (id int CONSTRAINT repeated REFERENCES parent(id)); ALTER TABLE child ADD CONSTRAINT repeated UNIQUE(id);",
    "CREATE TABLE t (id int CONSTRAINT empty);",
    "CREATE TABLE t (id int CONSTRAINT unsafe DEFAULT dangerous());",
    "CREATE TABLE t (id int CONSTRAINT unsafe CHECK(id>0));",
    "CREATE TABLE t (id int CONSTRAINT one PRIMARY KEY CONSTRAINT two PRIMARY KEY);",
    "CREATE TABLE t (id int CONSTRAINT wrong FOREIGN KEY(id) REFERENCES t(id));",
  ])("recusa integralmente constraint inválida sem conteúdo parcial: %s", (ddl) => {
    expect(() =>
      importStructuralDdl({ system: "Fixture", label: "v1", dialect: "postgres", ddl }, crypto),
    ).toThrow();
  });
  it.each(["postgres", "mssql", "sybase"])(
    "preserva PK/FK composta, tipos e ordem no dialeto %s",
    (dialect) => {
      const result = importStructuralDdl(
        {
          system: "Fixture",
          label: "v1",
          dialect,
          ddl: `CREATE TABLE parent (id int NOT NULL, branch int NOT NULL, PRIMARY KEY(id,branch));
    CREATE TABLE child (id int PRIMARY KEY, parent_id int, parent_branch int, amount decimal(18,2));
    ALTER TABLE child ADD CONSTRAINT child_parent FOREIGN KEY (parent_id,parent_branch) REFERENCES parent(id,branch);`,
        },
        crypto,
      );
      expect(result).toMatchObject({ technicalEvidence: false, semanticReview: false });
      expect(result.content.tables[0]!.grain).toEqual(["id", "branch"]);
      expect(result.content.tables[1]!.columns[3]!.nativeTypes?.[0]).toMatchObject({
        precision: 18,
        scale: 2,
      });
      expect(result.content.tables[1]!.columns[3]!.logicalType).toBe("decimal(18,2)");
      expect(result.content.relationships[0]).toMatchObject({
        constraintStatus: "unknown",
        keys: [
          { from: "parent_id", to: "id" },
          { from: "parent_branch", to: "branch" },
        ],
      });
      expect(
        result.content.tables
          .flatMap((t) => t.columns)
          .every((c) => c.classification === "inferido"),
      ).toBe(true);
    },
  );
  it("não inventa grão para tabela sem chave declarada", () => {
    const r = importStructuralDdl(
      {
        system: "Fixture",
        label: "v1",
        dialect: "postgres",
        ddl: "CREATE TABLE no_key (value int);",
      },
      crypto,
    );
    expect(r.content.tables[0]!.grain).toEqual([]);
    expect(r.warnings.join(" ")).toContain("grão");
  });
  it("não retorna declarações incompatíveis com os limites do modelo compartilhado", () => {
    const columns = Array.from({ length: 17 }, (_, i) => `col_${i}`);
    for (const ddl of [
      `CREATE TABLE t (${"x".repeat(101)} int);`,
      `CREATE TABLE t (id int, CONSTRAINT ${"c".repeat(201)} PRIMARY KEY(id));`,
      `CREATE TABLE parent (${columns.map((c) => `${c} int`).join(",")}, PRIMARY KEY(${columns.join(",")}));
       CREATE TABLE child (${columns.map((c) => `${c} int`).join(",")}, FOREIGN KEY(${columns.join(",")}) REFERENCES parent(${columns.join(",")}));`,
      "CREATE TABLE public.se7e_source_identity (id int PRIMARY KEY);",
    ]) {
      expect(() =>
        importStructuralDdl({ system: "Fixture", label: "v1", dialect: "postgres", ddl }, crypto),
      ).toThrow();
    }
  });
  it.each([
    "CREATE TABLE t (id int); INSERT INTO t VALUES (1);",
    "CREATE TABLE t (id int); DROP TABLE t;",
    "CREATE TABLE t (id int DEFAULT dangerous());",
    "CREATE TABLE t (id int); EXEC do_something;",
    "CREATE TABLE t (id int); SELECT 1;",
    "CREATE TABLE t (id int CHECK(id>0));",
    "CREATE TABLE t (id int); ALTER TABLE t DROP COLUMN id;",
    "CREATE TABLE t (id int); ALTER TABLE absent ADD PRIMARY KEY(id);",
    "CREATE TABLE t (id int, FOREIGN KEY (id) REFERENCES hidden(id));",
    "CREATE TABLE t (id int); /* unclosed",
    "CREATE TABLE t (id int); CREATE VIEW x AS SELECT id FROM t;",
    "CREATE TABLE t (id int); CREATE TABLE t (id int);",
    'CREATE TABLE "MixedCase" (id int);',
  ])("recusa integralmente gramática não suportada: %s", (ddl) => {
    expect(() =>
      importStructuralDdl({ system: "Fixture", label: "v1", dialect: "postgres", ddl }, crypto),
    ).toThrow();
  });
});
describe("biblioteca editorial tipada", () => {
  it("importação recusa seleção repetida de exemplos antes de criar rascunho", () => {
    const reference = {
      catalogId: crypto.randomId(),
      templateId: crypto.randomId(),
      templateVersion: 1,
      templateHash: "a".repeat(64),
      sourceId: crypto.randomId(),
      sourceVersion: 1,
      dialect: "postgres",
      exampleId: "principal",
      slug: "fixture",
      name: "Fixture",
    };
    expect(() =>
      templateDraftImportSchema.parse({ ...reference, additionalExampleIds: ["principal"] }),
    ).toThrow();
    expect(() =>
      templateDraftImportSchema.parse({ ...reference, additionalExampleIds: ["outro", "outro"] }),
    ).toThrow();
  });
  it("dataset respeita a precisão conservada pelo DDL após revisão explícita", () => {
    const declared = importStructuralDdl(
      {
        system: "Fixture",
        label: "v1",
        dialect: "postgres",
        ddl: "CREATE TABLE orders (id int PRIMARY KEY, amount decimal(4,2) NOT NULL);",
      },
      crypto,
    );
    const content = templatePayloadSchema.parse({
      kind: "template",
      content: declared.content,
    }).content;
    content.tables[0]!.columns.forEach((c) => {
      c.classification = "livre";
    });
    const data = datasetPayloadSchema.parse({
      kind: "dataset",
      templateId: crypto.randomId(),
      templateVersion: 1,
      templateHash: "a".repeat(64),
      provenance: { kind: "synthetic", description: "Fixture" },
      tables: [
        {
          tableId: content.tables[0]!.id,
          columns: [
            { name: "id", type: "integer" },
            { name: "amount", type: "decimal" },
          ],
          rows: [[1, "100.00"]],
        },
      ],
    });
    expect(() => validateDataset(data, { kind: "template", content })).toThrow("incompatível");
    data.tables[0]!.rows = [[1, "99.99"]];
    expect(() => validateDataset(data, { kind: "template", content })).not.toThrow();
  });
  const template = templatePayloadSchema.parse({ kind: "template", content: structureContent() });
  const dataset = () =>
    datasetPayloadSchema.parse({
      kind: "dataset",
      templateId: "11111111-1111-4111-8111-111111111111",
      templateVersion: 1,
      templateHash: "a".repeat(64),
      provenance: { kind: "synthetic", description: "Fixture artificial" },
      tables: [
        {
          tableId: "orders",
          columns: [
            { name: "id", type: "integer" },
            { name: "amount", type: "decimal" },
          ],
          rows: [[1, "1234567890123456.12"]],
        },
      ],
    });
  it("template não herda estado editorial aprovado", () => {
    const r = candidateTemplate(template, crypto);
    expect(r.kind === "template" && r.content.examples[0]!.state).toBe("candidate");
  });
  it("preserva decimal como texto sem arredondamento", () => {
    expect(() => validateDataset(dataset(), template)).not.toThrow();
  });
  it("recusa tipo declarado pelo dataset diferente do template, inclusive sem linhas", () => {
    const d = dataset();
    d.tables[0]!.columns[1]!.type = "string";
    expect(() => validateDataset(d, template)).toThrow("diverge");
    d.tables[0]!.rows = [];
    expect(() => validateDataset(d, template)).toThrow("diverge");
  });
  it("não adivinha tipos lógicos desconhecidos nem converte tipos nativos ambíguos", () => {
    for (const logicalType of [
      "currency",
      "timestamp",
      "numeric(12,wrong)",
      "decimal(0)",
      "numeric(2,3)",
    ]) {
      const unknown = structuredClone(template);
      unknown.content.tables[0]!.columns[1]!.logicalType = logicalType;
      expect(() => validateDataset(dataset(), unknown)).toThrow("desconhecido");
    }
  });
  it("confere precisão e escala declaradas sem converter decimais para Number", () => {
    for (const value of ["12345678901234567.12", "10.123", "-0.001"]) {
      const d = dataset();
      d.tables[0]!.rows = [[1, value]];
      expect(() => validateDataset(d, template)).toThrow("incompatível");
    }
    for (const value of ["-1234567890123456.12", "00010.25", "0.00"]) {
      const d = dataset();
      d.tables[0]!.rows = [[1, value]];
      expect(() => validateDataset(d, template)).not.toThrow();
    }
    const fractional = structuredClone(template);
    fractional.content.tables[0]!.columns[1]!.logicalType = "numeric(2,2)";
    const d = dataset();
    d.tables[0]!.rows = [[1, "0.12"]];
    expect(() => validateDataset(d, fractional)).not.toThrow();
    d.tables[0]!.rows = [[1, "1.12"]];
    expect(() => validateDataset(d, fractional)).toThrow();
  });
  it("confere comprimento lógico de texto em Unicode sem truncar nem contar bytes nativos", () => {
    const textTemplate = structuredClone(template);
    textTemplate.content.tables[0]!.columns[1]!.logicalType = "varchar(2)";
    const data = dataset();
    data.tables[0]!.columns[1]!.type = "string";
    for (const value of ["", "á", "🙂é"]) {
      data.tables[0]!.rows = [[1, value]];
      expect(() => validateDataset(data, textTemplate)).not.toThrow();
    }
    data.tables[0]!.rows = [[1, "🙂éx"]];
    expect(() => validateDataset(data, textTemplate)).toThrow("incompatível");
    expect(data.tables[0]!.rows[0]![1]).toBe("🙂éx");
    for (const logicalType of ["varchar(0)", "nvarchar(2147483648)", "char(999999999999999999)"]) {
      textTemplate.content.tables[0]!.columns[1]!.logicalType = logicalType;
      data.tables[0]!.rows = [];
      expect(() => validateDataset(data, textTemplate)).toThrow("desconhecido");
    }
  });
  it("recusa decimal numérico, inteiro inseguro, coluna oculta e linha desalinhada", () => {
    for (const row of [[1, 1.25], [Number.MAX_SAFE_INTEGER + 1, "1.25"], [1]]) {
      const d = dataset();
      d.tables[0]!.rows = [row];
      expect(() => validateDataset(d, template)).toThrow();
    }
    const d = dataset();
    d.tables[0]!.columns[0]!.name = "password";
    expect(() => validateDataset(d, template)).toThrow();
  });
  it("material autorizado exige referência explícita, não aceita aprovação herdada", () => {
    const d = dataset();
    expect(() =>
      datasetPayloadSchema.parse({
        ...d,
        provenance: { kind: "authorized", description: "Material autorizado" },
      }),
    ).toThrow();
    expect(() => datasetPayloadSchema.parse({ ...d, approved: true })).toThrow();
  });
});
