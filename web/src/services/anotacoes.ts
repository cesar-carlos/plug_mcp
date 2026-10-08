import { api, type AnotacaoItem } from "../api";
import { booleanField, optionalString, record, records, stringField } from "../validation";
export const parseAnotacao = (row: Record<string, unknown>): AnotacaoItem => {
  const revisao = record(row.revisao);
  const dias = row.periodoRevisaoDias;
  if (dias != null && typeof dias !== "number") {
    throw new Error("Cadência de revisão incompatível.");
  }
  return {
    id: stringField(row, "id"),
    titulo: stringField(row, "titulo"),
    tipo: stringField(row, "tipo"),
    texto: stringField(row, "texto"),
    tabelaId: optionalString(row, "tabelaId"),
    fonteTipo: optionalString(row, "fonteTipo"),
    fonteReferencia: optionalString(row, "fonteReferencia"),
    responsavel: optionalString(row, "responsavel"),
    validadoEm: optionalString(row, "validadoEm"),
    vigenteDe: optionalString(row, "vigenteDe"),
    vigenteAte: optionalString(row, "vigenteAte"),
    revisarEm: optionalString(row, "revisarEm"),
    status: optionalString(row, "status"),
    periodoRevisaoDias: dias ?? null,
    ativaAgora: booleanField(row, "ativaAgora"),
    revisao: {
      pendente: booleanField(revisao, "pendente"),
      proximaEm: optionalString(revisao, "proximaEm") ?? null,
      venceEm: optionalString(revisao, "venceEm") ?? null,
    },
  };
};
export const listarAnotacoes = async (
  bearer: string | undefined,
  somenteRevisao: boolean,
): Promise<AnotacaoItem[]> =>
  records(
    record(
      await api.get(
        `/app/api/anotacoes${somenteRevisao ? "?somenteRevisaoPendente=true" : ""}`,
        bearer,
      ),
    ).anotacoes,
  ).map(parseAnotacao);
