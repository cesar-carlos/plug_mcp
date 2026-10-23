import type { StructureContent } from "../../src/domain/persona-v2/shared-knowledge.js";

/** Fictional schema for tests. It does not describe or certify the Data7 ERP. */
export const structureContent = (): StructureContent => ({
  system: "Fixture ERP",
  label: "1.0",
  dialects: ["postgres", "mssql", "sybase"],
  tables: [
    {
      id: "orders",
      name: "orders",
      meaning: "Um pedido sintético por identificador",
      resourceType: "table",
      grain: ["id"],
      physicalNames: [],
      columns: [
        {
          name: "id",
          meaning: "Identificador",
          logicalType: "integer",
          nullable: false,
          classification: "livre",
        },
        {
          name: "amount",
          meaning: "Valor sintético em BRL",
          logicalType: "decimal(18,2)",
          nullable: false,
          classification: "livre",
        },
      ],
    },
  ],
  relationships: [],
  examples: [
    {
      id: "orders-after-id",
      purpose: "Pedidos após identificador",
      explanation: "Limita por parâmetro e ordena pela chave",
      state: "approved",
      variants: ["postgres", "mssql", "sybase"].map((dialect) => ({
        dialect: dialect as "postgres" | "mssql" | "sybase",
        sql: "SELECT p.id, p.amount FROM orders p WHERE p.id > :minimum ORDER BY p.id",
        parameters: [
          { name: "minimum", type: "integer", required: true, meaning: "Identificador mínimo" },
        ],
      })),
    },
  ],
  rules: ["Valores sintéticos em BRL"],
});
