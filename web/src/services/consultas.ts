import { api } from "../api";
import { record, records, stringField } from "../validation";

export interface Consulta {
  id: string;
  pergunta: string;
  status: string;
  skillIds: string[];
  sql?: string;
  publicacoes?: { skillId: string; id: string; hash: string }[];
  paramsContrato?: Record<string, unknown>[];
}
export interface ConsultaPreview {
  hash: string;
  consulta: Consulta;
}
export const parseConsulta = (value: unknown): Consulta => {
  const row = record(value);
  if (!Array.isArray(row.skillIds) || !row.skillIds.every((id) => typeof id === "string")) {
    throw new Error("Vínculos de consulta incompatíveis.");
  }
  return {
    id: stringField(row, "id"),
    pergunta: stringField(row, "pergunta"),
    status: stringField(row, "status"),
    skillIds: row.skillIds,
    sql: typeof row.sql === "string" ? row.sql : undefined,
    publicacoes:
      row.publicacoes == null
        ? undefined
        : records(row.publicacoes).map((binding) => ({
            skillId: stringField(binding, "skillId"),
            id: stringField(binding, "id"),
            hash: stringField(binding, "hash"),
          })),
    paramsContrato: row.paramsContrato == null ? undefined : records(row.paramsContrato),
  };
};
export const listarConsultas = async (
  bearer: string | undefined,
  pagina: number,
  estado: string,
): Promise<{ consultas: Consulta[]; total: number }> => {
  const result = record(
    await api.get(
      `/app/api/consultas?pagina=${pagina}&limite=25${estado ? `&estado=${encodeURIComponent(estado)}` : ""}`,
      bearer,
    ),
  );
  if (typeof result.total !== "number") {
    throw new Error("Total de consultas incompatível.");
  }
  return { consultas: records(result.consultas).map(parseConsulta), total: result.total };
};
export const obterConsulta = async (id: string, bearer?: string): Promise<Consulta> => {
  const result = record(await api.get(`/app/api/consultas/${encodeURIComponent(id)}`, bearer));
  return parseConsulta(result.consulta);
};
export const previewConsulta = (value: unknown): ConsultaPreview => {
  const result = record(value);
  const consulta = parseConsulta(result.consulta);
  if (consulta.sql === undefined) {
    throw new Error("Preview de consulta sem SQL. Gere uma nova revisão.");
  }
  return { hash: stringField(result, "confirmacaoHash"), consulta };
};
export const novoExemplo = (
  consulta: Consulta,
): { pergunta: string; sql: string; skillIds: string[] } => ({
  pergunta: consulta.pergunta,
  sql: consulta.sql ?? "",
  skillIds: [...consulta.skillIds],
});
