import { expect, it } from "vitest";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { enforceSourceRestrictions } from "../../../src/application/persona-v2/source-restrictions.js";
import {
  bindNamedParams,
  coerceBoundParams,
} from "../../../src/application/use-cases/shared/sql-modelo.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { personaDialectGuide } from "../../../src/application/persona-v2/dialect-guide.js";
import { sourceQuerySchema } from "../../../src/application/persona-v2/source-query.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../../src/infrastructure/mcp/server-instructions.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";

import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";
import { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";

it("exemplos de paginação do tópico SQL respeitam o contrato e o tamanho efetivo", () => {
  const contract = PERSONA_V2_TRAINING_BASE.queryContract;
  expect(trainingTopic("sql").queryContract).toEqual(contract);
  const model = sourceQuerySchema.parse(contract.publishedModelExample.arguments);
  expect(model.skillIds).toHaveLength(1);
  expect(model.sql).toBeUndefined();
  const bound = bindNamedParams(
    "SELECT id FROM fixture WHERE inicio >= :inicio AND valor >= :minimo AND ativo = :ativo",
    model.params,
  );
  expect(
    coerceBoundParams(bound, [
      { nome: "inicio", tipo: "date", obrigatorio: true, descricao: "Início" },
      { nome: "minimo", tipo: "decimal", obrigatorio: true, descricao: "Mínimo" },
      { nome: "ativo", tipo: "boolean", obrigatorio: true, descricao: "Ativo" },
    ]),
  ).toEqual({ inicio: "2026-01-01", minimo: "10.50", ativo: true });
  expect(sourceQuerySchema.safeParse({ params: { minimo: [10, 20] } }).success).toBe(false);
  const optional = [
    { nome: "minimo", tipo: "decimal" as const, obrigatorio: false, descricao: "Mínimo" },
  ];
  expect(bindNamedParams("SELECT id FROM fixture WHERE valor >= :minimo", {}, optional)).toEqual({
    minimo: null,
  });
  const { firstPage, nextPageExample } = contract.pagination;
  expect(sourceQuerySchema.parse(firstPage).options).toEqual({ page: 1, pageSize: 50 });
  expect(sourceQuerySchema.parse(nextPageExample).options).toEqual({ page: 2, pageSize: 20 });
});

const crypto = new NodeCryptoAdapter("a".repeat(64));
it.each(["mssql", "postgres", "sybase"] as const)("guia %s usa contrato MCP v2", (dialect) => {
  const guide = personaDialectGuide(dialect);
  expect(guide.paginacao).toContain("options.pageSize");
  expect(guide.paginacao).toContain("pagination.hasNextPage");
  expect(guide.paginacao).toContain("pagination.pageSize");
  expect(guide.paginacao).toContain("Em leitura sem pagination, confira completeness.complete");
  expect(guide.paginacao).toContain("completeness.truncated não indica próxima página");
  expect(guide.paginacao).not.toContain("use TOP n");
  expect(JSON.stringify(guide)).not.toMatch(/page_size|paginacao\.hasNextPage|max_rows/);
  expect(sourceQuerySchema.safeParse({ options: { page: 1, pageSize: 10 } }).success).toBe(true);
  expect(sourceQuerySchema.safeParse({ options: { page: 1, page_size: 10 } }).success).toBe(false);
});
it("instruções exigem fatos retornados e distinguem erro, ausência e incompletude", () => {
  expect(PERSONA_V2_INSTRUCTIONS).toContain("prompt apresentacao");
  expect(PERSONA_V2_INSTRUCTIONS).toContain("Nunca invente valores");
  expect(PERSONA_V2_INSTRUCTIONS).toContain("erro ou falta de permissão não significa ausência");
  expect(PERSONA_V2_INSTRUCTIONS).toContain("filtros e fontes consultados");
});
it("orienta o treinamento com runners separados sem anunciar entregas existentes como ausentes", () => {
  expect(PERSONA_V2_INSTRUCTIONS).toContain("Runners de publicação são exclusivos do operador");
  expect(PERSONA_V2_INSTRUCTIONS).toContain("não execute runners por MCP");
  expect(PERSONA_V2_INSTRUCTIONS).not.toMatch(/runners genéricos[^.]*permanecem pendentes/);
  expect(PERSONA_V2_INSTRUCTIONS).toContain("Quando anunciada, propor_contrato_externo");
  expect(PERSONA_V2_INSTRUCTIONS).not.toContain(
    "Não há tool de descoberta/importação administrativa nesta entrega",
  );
});
it("histórico orienta os dois tipos concedidos sem ampliar a leitura editorial", () => {
  const history = /listar_historico_conhecimento\(\{skillId,afterSkillId\?\}\)[^.]+/u.exec(
    PERSONA_V2_INSTRUCTIONS,
  )?.[0];
  expect(history).toContain("skills de consulta ou operação SQL concedidas");
  expect(PERSONA_V2_INSTRUCTIONS).toContain(
    "Para o contexto de consultas ou operações SQL, use obter_skill",
  );
  expect(PERSONA_V2_INSTRUCTIONS).toContain(
    "obter_padrao mantém seu alcance editorial de consultas",
  );
});
it.each(["mssql", "postgres", "sybase"] as const)(
  "%s valida schema exato, alias e recortes",
  (dialect) => {
    const training = queryTraining();
    const source = {
      ...trainingSource,
      dialect,
      rowRestrictions: [
        { table: "dbo.orders", column: "id", parameter: "__scope_owner", value: 1 },
      ],
    };
    const sql = "SELECT p.id, p.amount FROM dbo.orders p WHERE p.id = :__scope_owner ORDER BY p.id";
    const pkg = compileQueryTraining(
      {
        ...training,
        dialect,
        sqlModel: sql,
        tables: training.tables.map((t) => ({ ...t, name: "dbo.orders" })),
        columns: training.columns.map((c) => ({ ...c, table: "dbo.orders" })),
      },
      source,
      crypto,
    );
    expect(pkg.scope.tabelas).toEqual(["dbo.orders"]);
    expect(pkg.requiredCapabilities).toContain(`column:${source.id}:dbo.orders.amount`);
    const ast = validateSourceSql(sql, dialect, pkg.scope);
    enforceSourceRestrictions(ast, pkg.scope, source.rowRestrictions);
    for (const bad of [
      sql.replace("dbo.orders", "other.orders"),
      sql.replace("dbo.orders", "orders"),
      sql.replace("p.id = :__scope_owner", "p.id > 0 OR p.id = :__scope_owner"),
    ]) {
      expect(() =>
        enforceSourceRestrictions(
          validateSourceSql(bad, dialect, pkg.scope),
          pkg.scope,
          source.rowRestrictions,
        ),
      ).toThrow();
    }
    expect(() => parseSelect(sql, dialect)).toThrow();
  },
);
it.each([
  "SELECT p.id FROM another.dbo.orders p WHERE p.id > 0",
  "SELECT p.id FROM remote.another.dbo.orders p WHERE p.id > 0",
  "SELECT id FROM dbo.orders WHERE id > 0",
  'SELECT p.id FROM "other.schema".orders p WHERE p.id > 0',
])("não habilita banco remoto, qualificação ambígua ou identificador composto: %s", (sql) => {
  expect(() => parseSelect(sql, "mssql", { allowSchemaQualifiedTables: true })).toThrow();
});
