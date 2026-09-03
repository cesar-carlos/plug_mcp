import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { PACOTE_VERSAO_ATUAL } from "../../../domain/entities/escopo.js";
import { escopoFromSqlModelo } from "./escopo-from-modelo.js";
import { parseSqlModelo } from "./sql-modelo.js";
import { validarSqlNoEscopo } from "./validar-escopo.js";

export interface BackfillSkillRow {
  readonly id: string;
  readonly acessoId: string;
  readonly sqlModelo: string;
  readonly status: string;
}

export interface BackfillConsultaRow {
  readonly id: string;
  readonly acessoId: string;
  readonly sql: string;
}

export interface BackfillAnotacaoRow {
  readonly id: string;
  readonly acessoId: string;
  readonly tabelaId: string | null;
  readonly skillId: string | null;
}

export interface BackfillReportAgent {
  migradas: number;
  rebaixadas: number;
  revalidadas: number;
  orfas: number;
}

export const sqlCabeNoEscopo = (sql: string, dialeto: Dialeto, escopo: EscopoSkill): boolean => {
  try {
    validarSqlNoEscopo(sql, dialeto, escopo);
    return true;
  } catch {
    return false;
  }
};

export const reconstruirEscopoOuErro = (
  sqlModelo: string,
): { ok: true; escopo: EscopoSkill } | { ok: false; motivo: string } => {
  try {
    const escopo = escopoFromSqlModelo(parseSqlModelo(sqlModelo));
    return { ok: true, escopo: { ...escopo, pacoteVersao: PACOTE_VERSAO_ATUAL } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "sql inválido";
    return { ok: false, motivo: message.slice(0, 400) };
  }
};

export const associarConsultaASkills = (
  sql: string,
  dialeto: Dialeto,
  skills: readonly { id: string; escopo: EscopoSkill }[],
): { skillIds: readonly string[]; inativa: boolean } => {
  const matches = skills.filter((skill) => sqlCabeNoEscopo(sql, dialeto, skill.escopo));
  if (matches.length === 0) {
    return { skillIds: [], inativa: true };
  }
  return { skillIds: matches.map((item) => item.id), inativa: false };
};

export const associarAnotacaoASkill = (
  anotacao: BackfillAnotacaoRow,
  tabelaNome: string | null,
  skills: readonly { id: string; escopo: EscopoSkill }[],
): string | null => {
  if (anotacao.skillId) {
    return anotacao.skillId;
  }
  if (!tabelaNome) {
    return null;
  }
  const wanted = tabelaNome.toLowerCase();
  const matches = skills.filter((skill) =>
    skill.escopo.tabelas.some((nome) => nome.toLowerCase() === wanted),
  );
  if (matches.length === 1) {
    return matches[0]?.id ?? null;
  }
  return null;
};

export const emptyReport = (): BackfillReportAgent => ({
  migradas: 0,
  rebaixadas: 0,
  revalidadas: 0,
  orfas: 0,
});
