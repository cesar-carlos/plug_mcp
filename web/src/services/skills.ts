import { api, type SkillRow, type SkillSqlModeloRow, type SkillFalta } from "../api";
import { optionalString, record, records, stringField } from "../validation";
const falta = (row: Record<string, unknown>): SkillFalta => ({
  kind: stringField(row, "kind"),
  message: stringField(row, "message"),
  alvo: stringField(row, "alvo"),
  nextAction: stringField(row, "nextAction"),
});
export const parseSkillRow = (row: Record<string, unknown>): SkillRow => {
  const fluxo = row.fluxoTreino == null ? null : record(row.fluxoTreino);
  return {
    id: stringField(row, "id"),
    nome: stringField(row, "nome"),
    slug: stringField(row, "slug"),
    status: stringField(row, "status"),
    statusRascunho: optionalString(row, "statusRascunho"),
    publicacaoAtivaId: optionalString(row, "publicacaoAtivaId"),
    fluxoTreino: fluxo ? { proximoPasso: optionalString(fluxo, "proximoPasso") } : undefined,
    faltas: row.faltas == null ? [] : records(row.faltas).map(falta),
  };
};
export const listarSkills = async (bearer?: string): Promise<SkillRow[]> =>
  records(record(await api.get("/app/api/skills", bearer)).skills).map(parseSkillRow);
export const listarModelos = async (bearer?: string): Promise<SkillSqlModeloRow[]> =>
  records(record(await api.get("/app/api/skills/modelos", bearer)).skills).map((row) => ({
    ...parseSkillRow(row),
    statusRascunho: stringField(row, "statusRascunho"),
    motivoRevalidacao: optionalString(row, "motivoRevalidacao") ?? null,
    sqlModelo: stringField(row, "sqlModelo"),
    faltas: records(row.faltas).map(falta),
  }));
