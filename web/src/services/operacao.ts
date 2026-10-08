import { api, type AlertaItem, type EntregaItem, type LacunaItem } from "../api";
import { booleanField, record, records, stringField } from "../validation";
export const listarAlertas = async (
  bearer?: string,
): Promise<{ alertas: AlertaItem[]; entregas: EntregaItem[] }> => {
  const result = record(await api.get("/app/api/alertas", bearer));
  return {
    alertas: records(result.alertas).map((row) => ({
      id: stringField(row, "id"),
      categoria: stringField(row, "categoria"),
      severidade: stringField(row, "severidade"),
      status: stringField(row, "status"),
    })),
    entregas: records(result.entregas).map((row) => ({
      id: stringField(row, "id"),
      deadLetter: booleanField(row, "deadLetter"),
      pendente: booleanField(row, "pendente"),
    })),
  };
};
export const listarLacunas = async (
  bearer: string | undefined,
  status: string,
): Promise<LacunaItem[]> =>
  records(
    record(await api.get(`/app/api/lacunas?status=${encodeURIComponent(status)}`, bearer)).lacunas,
  ).map((row) => ({
    id: stringField(row, "id"),
    tipo: stringField(row, "tipo"),
    status: stringField(row, "status"),
    pergunta: stringField(row, "pergunta"),
  }));
