import type { Dialeto } from "../../../domain/entities/dialeto.js";
import { uniaoEscopos, type EscopoSkill } from "../../../domain/entities/escopo.js";
import type { PoliticaConsulta } from "../../../domain/entities/politica-consulta.js";
import type { Skill } from "../../../domain/entities/skill.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import { escopoFromSqlModelo } from "./escopo-from-modelo.js";
import { persistirEscopoSeVazio } from "./persistir-escopo.js";
import { parseSqlModelo } from "./sql-modelo.js";
import { tryParseSelect } from "./sql-ast.js";
import { hintComProximos } from "./sugestoes.js";

export const idsSkillDaChamada = (input: {
  skillId?: string;
  skillIds?: readonly string[];
}): string[] => [
  ...new Set(
    [...(input.skillIds ?? []), input.skillId ?? ""]
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  ),
];

export const escopoDaSkillPublicada = (skill: Skill): EscopoSkill =>
  skill.escopo.tabelas.length > 0
    ? skill.escopo
    : escopoFromSqlModelo(parseSqlModelo(skill.sqlModelo));

export const resolverSkillsConsulta = async (
  skills: SkillRepositoryPort,
  agentId: string,
  ids: readonly string[],
): Promise<Skill[]> => {
  if (ids.length === 0) {
    const conhecidas = await skills.listByAgent(agentId);
    const publicadas: Skill[] = [];
    for (const item of conhecidas) {
      if (item.status === "publicada") {
        publicadas.push(await persistirEscopoSeVazio(skills, item));
      }
    }
    if (publicadas.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_GAP,
        message: "Não há skill publicada neste agentId.",
        hint: "Publique uma skill (validar_skill → publicar_skill) ou treine uma nova. SKILL_GAP da busca por termos não prova ausência — listar_skills.",
      });
    }
    return publicadas;
  }
  const out: Skill[] = [];
  for (const id of ids) {
    const found = await skills.findById(id);
    if (found?.agentId !== agentId) {
      const conhecidas = await skills.listByAgent(agentId);
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: hintComProximos(
          "Confira skillId com listar_skills no mesmo acesso.",
          id,
          conhecidas.flatMap((item) => [item.slug, item.id]),
        ),
      });
    }
    if (found.status !== "publicada") {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_PUBLISHED,
        message: "Só skill publicada pode consultar o ERP.",
        hint:
          found.status === "validada"
            ? "Chame publicar_skill antes de consultar_dados."
            : "Valide e publique a skill (validar_skill → publicar_skill).",
      });
    }
    out.push(await persistirEscopoSeVazio(skills, found));
  }
  return out;
};

const tabelasFisicasSql = (sql: string, dialeto: Dialeto): readonly string[] => {
  try {
    const ast = tryParseSelect(sql, dialeto);
    if (ast) {
      return ast.tabelas
        .filter((tabela) => !tabela.isCte && !tabela.isSubquery)
        .map((tabela) => tabela.nome);
    }
  } catch {
    // Firebird / parse falho: cai no modelo.
  }
  return parseSqlModelo(sql).tabelas.map((tabela) => tabela.nome);
};

export const atribuirSkillsPorSql = (
  allowlist: readonly Skill[],
  sql: string,
  dialeto: Dialeto,
  preferidas: readonly string[] = [],
): Skill[] => {
  const nomes = new Set(tabelasFisicasSql(sql, dialeto).map((nome) => nome.toLowerCase()));
  const porTabela = allowlist.filter((skill) =>
    escopoDaSkillPublicada(skill).tabelas.some((tabela) => nomes.has(tabela.toLowerCase())),
  );
  const extra = preferidas
    .map((id) => allowlist.find((skill) => skill.id === id))
    .filter((skill): skill is Skill => Boolean(skill));
  const seen = new Set<string>();
  const merged: Skill[] = [];
  for (const skill of [...porTabela, ...extra]) {
    if (!seen.has(skill.id)) {
      seen.add(skill.id);
      merged.push(skill);
    }
  }
  return merged.length > 0 ? merged : [...allowlist];
};

export const ancoraSqlModelo = (
  allowlist: readonly Skill[],
  idsExplicitos: readonly string[],
): Skill => {
  if (idsExplicitos.length === 1) {
    return allowlist[0]!;
  }
  if (idsExplicitos.length > 1) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Cruzar skills exige SQL customizado.",
      hint: "Passe skillIds de todos os domínios e o SELECT no escopo unido. Sem sql só a consulta exemplo da primeira skill rodaria.",
    });
  }
  if (allowlist.length === 1) {
    return allowlist[0]!;
  }
  throw new DomainError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: "Sem sql, informe skillId da consulta exemplo.",
    hint: "Passe sql, consultaSemantica, consultaAprendidaId ou skillId de uma skill publicada. Com várias publicadas o servidor não escolhe o sqlModelo.",
  });
};

export const ancoraConsultaSemantica = (
  allowlist: readonly Skill[],
  aliases: readonly string[],
  idsExplicitos: readonly string[],
): Skill => {
  if (idsExplicitos.length > 1) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Consulta semântica vale para uma skill.",
      hint: "Passe um skillId. Cruze skills com SQL livre no escopo unido.",
    });
  }
  if (idsExplicitos.length === 1) {
    return allowlist[0]!;
  }
  const wanted = new Set(aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean));
  const candidatas = allowlist.filter((skill) =>
    escopoDaSkillPublicada(skill).metricasSaida.some((item) =>
      wanted.has(item.alias.toLowerCase()),
    ),
  );
  if (candidatas.length === 1) {
    return candidatas[0]!;
  }
  if (candidatas.length === 0) {
    throw DomainError.pacote({
      code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
      message: "Nenhuma skill publicada certifica essa métrica.",
      hint: "Use aliases de metricasSaida (obter_skill) ou passe skillId.",
    });
  }
  throw new DomainError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: "Consulta semântica vale para uma skill.",
    hint: "Várias publicadas têm o alias. Passe skillId.",
  });
};

export const politicaMaisRestrita = (skills: readonly Skill[]): PoliticaConsulta | null => {
  const politicas = skills
    .map((skill) => skill.politicaConsulta)
    .filter((item): item is PoliticaConsulta => item != null);
  if (politicas.length === 0) {
    return null;
  }
  const nums = (pick: (p: PoliticaConsulta) => number | undefined): number | undefined => {
    const vals = politicas.map(pick).filter((n): n is number => n != null);
    return vals.length > 0 ? Math.min(...vals) : undefined;
  };
  const maxRows = nums((p) => p.maxRows);
  const timeoutMs = nums((p) => p.timeoutMs);
  const maxTabelas = nums((p) => p.maxTabelas);
  const exigirRecorteTemporal = politicas.some((p) => p.exigirRecorteTemporal === true)
    ? true
    : undefined;
  const modoPreferencial = politicas.some((p) => p.modoPreferencial === "agregado")
    ? "agregado"
    : politicas.find((p) => p.modoPreferencial)?.modoPreferencial;
  if (
    maxRows == null &&
    timeoutMs == null &&
    maxTabelas == null &&
    exigirRecorteTemporal == null &&
    modoPreferencial == null
  ) {
    return null;
  }
  return {
    ...(maxRows != null ? { maxRows } : {}),
    ...(timeoutMs != null ? { timeoutMs } : {}),
    ...(maxTabelas != null ? { maxTabelas } : {}),
    ...(exigirRecorteTemporal != null ? { exigirRecorteTemporal } : {}),
    ...(modoPreferencial != null ? { modoPreferencial } : {}),
  };
};

export const uniaoEscoposPublicados = (skills: readonly Skill[]): EscopoSkill =>
  uniaoEscopos(skills.map(escopoDaSkillPublicada));
