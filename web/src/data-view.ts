export interface DataFact {
  readonly label: string;
  readonly value: string;
}

export interface DataTable {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly empty: string;
}

export interface DataPresentation {
  readonly facts: readonly DataFact[];
  readonly tables: readonly DataTable[];
}

const SKIP = new Set(["success", "fluxoTreino"]);
const FACT_LIMIT = 24;
const ROW_LIMIT = 50;
const COLUMN_LIMIT = 8;

const LABELS: Record<string, string> = {
  dialeto: "Dialeto",
  truncated: "Truncado",
  hint: "Aviso",
  tabelas: "Tabelas",
  schema: "Schema",
  table_name: "Tabela",
  object_type: "Tipo",
  conflitos: "Conflitos",
  kind: "Tipo",
  tabela: "Tabela",
  coluna: "Coluna",
  join: "JOIN",
  consultas: "Consultas",
  entradas: "Auditoria",
  total: "Total",
  pagina: "Página",
  createdAt: "Quando",
  tool: "Tool",
  sucesso: "Sucesso",
  codigoErro: "Erro",
  linhasRetornadas: "Linhas",
  duracaoMs: "Duração (ms)",
  pergunta: "Pergunta",
  status: "Status",
  nome: "Nome",
  slug: "Slug",
  publicado: "Publicado",
  confirmacaoHash: "Hash",
  porTool: "Por tool",
  porCodigo: "Por código",
  erros: "Erros",
  linhas: "Linhas",
  painel: "Painel",
  taxaErro: "Taxa de erro",
  taxaCacheHit: "Cache",
  taxaTruncamento: "Truncamento",
  message: "Mensagem",
  alvo: "Alvo",
  nextAction: "Próxima ação",
  faltas: "Faltas",
  mudancas: "Mudanças",
  tipo: "Tipo",
  colunas: "Colunas",
  avisos: "Avisos",
  nullable: "Nulo",
  papel: "Papel",
  acesso: "Acesso",
  hub: "Hub",
  resumoPublicacao: "Resumo",
  diffPublicacao: "Diff",
  janela: "Janela",
  observacoes: "Observações",
};

const labelOf = (key: string): string => LABELS[key] ?? key;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value: unknown): string | null => {
  if (value == null) {
    return "—";
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : "—";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "sim" : "não";
  }
  return null;
};

const cellText = (value: unknown): string => {
  const text = asText(value);
  if (text !== null) {
    return text;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => asText(item))
      .filter((item): item is string => item !== null && item !== "—");
    return parts.length > 0 ? parts.join(", ") : "—";
  }
  return "—";
};

const tableFromRows = (
  title: string,
  rows: readonly Record<string, unknown>[],
): DataTable | null => {
  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (SKIP.has(key) || keys.includes(key)) {
        continue;
      }
      const readable = rows.some((item) => asText(item[key]) !== null || Array.isArray(item[key]));
      if (readable) {
        keys.push(key);
      }
    }
  }
  const columns = keys.slice(0, COLUMN_LIMIT);
  if (columns.length === 0) {
    return null;
  }
  return {
    title,
    columns: columns.map(labelOf),
    rows: rows.slice(0, ROW_LIMIT).map((row) => columns.map((key) => cellText(row[key]))),
    empty: `Nenhum item em ${title.toLowerCase()}.`,
  };
};

const tableFromRecord = (title: string, record: Record<string, unknown>): DataTable | null => {
  const rows: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (!isRecord(value)) {
      return null;
    }
    rows.push({ nome: key, ...value });
  }
  if (rows.length === 0) {
    return null;
  }
  return tableFromRows(title, rows);
};

export const presentPayload = (value: unknown): DataPresentation => {
  const facts: DataFact[] = [];
  const tables: DataTable[] = [];
  const visit = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, child] of Object.entries(node)) {
      if (SKIP.has(key)) {
        continue;
      }
      const label = prefix ? `${prefix} · ${labelOf(key)}` : labelOf(key);
      const text = asText(child);
      if (text !== null) {
        if (facts.length < FACT_LIMIT) {
          facts.push({ label, value: text });
        }
        continue;
      }
      if (Array.isArray(child)) {
        if (child.length === 0) {
          tables.push({
            title: label,
            columns: [],
            rows: [],
            empty: `Nenhum item em ${label.toLowerCase()}.`,
          });
        } else if (child.every((item) => isRecord(item))) {
          const table = tableFromRows(label, child);
          if (table) {
            tables.push(table);
          }
        } else if (child.every((item) => asText(item) !== null) && facts.length < FACT_LIMIT) {
          const joined = child
            .map((item) => asText(item))
            .filter((item): item is string => item !== null && item !== "—")
            .join(", ");
          facts.push({ label, value: joined.length > 0 ? joined : "—" });
        }
        continue;
      }
      if (!isRecord(child) || prefix.split("·").length > 2) {
        continue;
      }
      const nested = tableFromRecord(label, child);
      if (nested) {
        tables.push(nested);
        continue;
      }
      visit(child, label);
    }
  };
  if (isRecord(value)) {
    visit(value, "");
  }
  return { facts, tables };
};
