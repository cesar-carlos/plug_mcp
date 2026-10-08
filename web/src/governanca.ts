import type { AnotacaoGovernanca } from "./form-payloads";
export interface GovernancaForm {
  vigenteDe: string;
  vigenteAte: string;
  revisarEm: string;
  fonteTipo: string;
  fonteReferencia: string;
  responsavel: string;
  status: string;
  periodoRevisaoDias: string;
}
export const governancaPayload = (
  current: GovernancaForm,
  original: GovernancaForm,
  editando: boolean,
): AnotacaoGovernanca => {
  const payload: AnotacaoGovernanca = {};
  for (const key of [
    "vigenteDe",
    "vigenteAte",
    "revisarEm",
    "fonteReferencia",
    "responsavel",
  ] as const) {
    if (editando ? current[key] !== original[key] : Boolean(current[key])) {
      payload[key] = current[key] || null;
    }
  }
  for (const key of ["fonteTipo", "status"] as const) {
    if (editando ? current[key] !== original[key] : Boolean(current[key])) {
      payload[key] = current[key];
    }
  }
  if (
    editando
      ? current.periodoRevisaoDias !== original.periodoRevisaoDias
      : Boolean(current.periodoRevisaoDias)
  ) {
    payload.periodoRevisaoDias = current.periodoRevisaoDias
      ? Number(current.periodoRevisaoDias)
      : null;
  }
  return payload;
};
