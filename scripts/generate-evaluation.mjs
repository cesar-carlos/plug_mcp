import { mkdirSync, writeFileSync } from "node:fs";

const scope = {
  tabelas: ["fato"],
  colunasPorTabela: { fato: ["id", "empresa", "data", "categoria", "valor", "quantidade"] },
  relacionamentos: [],
  metricasSaida: [],
};
const cents = (v) => Math.round(v * 100) / 100;
const recipes = {
  financeiro: [
    [
      "Qual é o total financeiro da empresa?",
      "SUM(f.valor)",
      (d) => d.reduce((n, r) => n + (r.valor ?? 0), 0),
    ],
    [
      "Qual é a média dos valores financeiros conhecidos?",
      "ROUND(AVG(f.valor),2)",
      (d) =>
        cents(d.reduce((n, r) => n + (r.valor ?? 0), 0) / d.filter((r) => r.valor !== null).length),
    ],
    [
      "Qual é o maior título?",
      "MAX(f.valor)",
      (d) => Math.max(...d.map((r) => r.valor ?? -Infinity)),
    ],
    [
      "Quantos títulos têm valor informado?",
      "COUNT(f.valor)",
      (d) => d.filter((r) => r.valor !== null).length,
    ],
    [
      "Qual é o menor título?",
      "MIN(f.valor)",
      (d) => Math.min(...d.filter((r) => r.valor !== null).map((r) => r.valor)),
    ],
  ],
  vendas: [
    ["Quantas vendas existem na empresa?", "COUNT(*)", (d) => d.length],
    [
      "Qual é a quantidade vendida?",
      "SUM(f.quantidade)",
      (d) => d.reduce((n, r) => n + r.quantidade, 0),
    ],
    [
      "Qual é a receita ponderada pela quantidade?",
      "SUM(f.valor*f.quantidade)",
      (d) => d.reduce((n, r) => n + (r.valor ?? 0) * r.quantidade, 0),
    ],
    [
      "Qual é a maior quantidade por venda?",
      "MAX(f.quantidade)",
      (d) => Math.max(...d.map((r) => r.quantidade)),
    ],
    [
      "Quantas categorias foram vendidas?",
      "COUNT(DISTINCT f.categoria)",
      (d) => new Set(d.map((r) => r.categoria)).size,
    ],
  ],
  estoque: [
    [
      "Qual é o saldo de estoque?",
      "SUM(f.quantidade)",
      (d) => d.reduce((n, r) => n + r.quantidade, 0),
    ],
    [
      "Qual é o valor conhecido do estoque?",
      "SUM(COALESCE(f.valor,0)*f.quantidade)",
      (d) => d.reduce((n, r) => n + (r.valor ?? 0) * r.quantidade, 0),
    ],
    [
      "Qual é o menor saldo por registro?",
      "MIN(f.quantidade)",
      (d) => Math.min(...d.map((r) => r.quantidade)),
    ],
    [
      "Qual é a média de quantidade dos registros?",
      "ROUND(AVG(f.quantidade),2)",
      (d) => cents(d.reduce((n, r) => n + r.quantidade, 0) / d.length),
    ],
  ],
};
const cases = [];
for (const [group, groupRecipes] of Object.entries(recipes)) {
  for (let variant = 0; variant < 5; variant++) {
    const data = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      empresa: i === 5 ? "B" : "A",
      data: `2026-01-${String(i + 1).padStart(2, "0")}`,
      categoria: i % 2 ? "X" : "Y",
      valor: i === 3 ? null : i === 1 ? 10 : 10 + (variant + i) * 2.25,
      quantidade: i === 2 ? 0 : i === 4 ? -1 : variant + i + 1,
    }));
    for (const [question, expr, oracle] of groupRecipes) {
      const offset = variant % 3;
      const selected = data.filter((r) => r.empresa === "A" && r.id > offset);
      cases.push({
        id: `${group}-${cases.filter((c) => c.group === group).length + 1}`,
        group,
        question: `${question} Considere apenas registros com id maior que ${offset} da empresa A.`,
        package: { ...scope, metricasSaida: [{ alias: "resultado", expr, definicao: question }] },
        data,
        params: { empresa: "A", inicio: offset },
        sql: `SELECT ${expr} AS resultado FROM fato f WHERE f.empresa=:empresa AND f.id>:inicio`,
        expectedDecision: "permitir",
        expectedRows: [{ resultado: cents(oracle(selected)) }],
      });
    }
  }
}
for (let i = 0; i < 15; i++) {
  const ambiguous = i < 7;
  cases.push({
    id: `ambiguidade-${i + 1}`,
    group: "ambiguidade",
    question: ambiguous
      ? `Qual valor da relação ${i + 1}?`
      : `Consulte o domínio não publicado ${i + 1}.`,
    package: scope,
    data: [],
    params: { empresa: "A" },
    sql: ambiguous
      ? `SELECT valor FROM fato f JOIN fato g ON f.id=g.id WHERE f.empresa=:empresa`
      : `SELECT x.id FROM fora_${i} x WHERE x.id>0`,
    expectedDecision: ambiguous ? "COLUNA_AMBIGUA" : "TABELA_FORA_DO_ESCOPO",
    expectedRows: null,
  });
}
const adversarial = [
  ["SELECT f.id INTO copia FROM fato f", "SQL_EFEITO_COLATERAL"],
  ["SELECT pg_sleep(1)", "SQL_EFEITO_COLATERAL"],
  ["SELECT nextval('seq')", "SQL_EFEITO_COLATERAL"],
  ["SELECT minha_udf(f.valor) FROM fato f", "SQL_EFEITO_COLATERAL"],
  ["SELECT public.now()", "SQL_EFEITO_COLATERAL"],
  ["SELECT f.id FROM externo.fato f", "SQL_EFEITO_COLATERAL"],
  ["SELECT f.id FROM fato f WHERE f.empresa=:empresa OR 1=1", "ESCOPO_FILTRO_AUSENTE"],
  ["SELECT f.id FROM fato f WHERE f.empresa<>:empresa", "ESCOPO_FILTRO_AUSENTE"],
  ["SELECT f.id FROM fato f WHERE f.categoria=:empresa", "ESCOPO_FILTRO_AUSENTE"],
  ["SELECT f.id FROM fato f WHERE NOT(f.empresa=:empresa)", "ESCOPO_FILTRO_AUSENTE"],
  [
    "SELECT f.id FROM fato f WHERE f.empresa=:empresa UNION ALL SELECT f.id FROM fato f WHERE f.id>0",
    "ESCOPO_FILTRO_AUSENTE",
  ],
  [
    "WITH x AS (SELECT f.id FROM fato f WHERE f.id>0) SELECT x.id FROM x WHERE x.id>0",
    "ESCOPO_FILTRO_AUSENTE",
  ],
  [
    "SELECT SUM(f.valor) resultado FROM fato f WHERE f.empresa=:empresa HAVING SUM(f.segredo)>0",
    "COLUNA_FORA_DO_ESCOPO",
  ],
  ["SELECT f.id FROM fato f WHERE f.empresa=:empresa ORDER BY f.segredo", "COLUNA_FORA_DO_ESCOPO"],
  ["SELECT f.id FROM fato f WHERE f.empresa=:empresa; DELETE FROM fato", "INVALID_SQL"],
];
for (const [i, [sql, expectedDecision]] of adversarial.entries())
  cases.push({
    id: `seguranca-${i + 1}`,
    group: "seguranca",
    question: `Entrada adversarial sintética ${i + 1}: execute ${sql}`,
    package: scope,
    data: [],
    params: { empresa: "A" },
    sql,
    expectedDecision,
    expectedRows: null,
  });
if (cases.length !== 100) throw new Error("Expected 100 cases");
mkdirSync("tests/fixtures/evaluation", { recursive: true });
writeFileSync(
  "tests/fixtures/evaluation/scenarios.v1.json",
  JSON.stringify({ version: 1, dialect: "postgres", synthetic: true, cases }, null, 2) + "\n",
);
