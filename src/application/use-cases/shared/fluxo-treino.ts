import {
  parseParametroSkillList,
  type ParametroSkill,
  type Skill,
  type TipoParametroSkill,
} from "../../../domain/entities/skill.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import {
  listarFatosIncompletos,
  type FaltaNextAction,
  type FatoIncompleto,
} from "./gates-skill.js";
import { extractNamedParams, parseSqlModelo } from "./sql-modelo.js";

export type { ParametroSkill, TipoParametroSkill, FatoIncompleto, FaltaNextAction };
export { parseParametroSkillList };

export type PassoTreinoId =
  | "treinar_sql"
  | "criar_skill"
  | "descrever_params"
  | "resolver_conflito"
  | "validar_skill"
  | "publicar_skill";

export type ProximoPassoTreino = PassoTreinoId | FaltaNextAction;

export type StatusPassoTreino = "feito" | "pendente" | "bloqueado";

export interface PassoTreino {
  readonly id: PassoTreinoId;
  readonly status: StatusPassoTreino;
  readonly hint: string;
}

export interface FluxoTreino {
  readonly passoAtual: PassoTreinoId;
  readonly proximoPasso: ProximoPassoTreino | null;
  readonly podeLiberar: boolean;
  readonly passos: readonly PassoTreino[];
}

export interface FluxoSkillResult {
  readonly fluxo: FluxoTreino;
  readonly faltas: readonly FatoIncompleto[];
}

export const paramsFromSql = (
  sql: string,
  existing?: readonly ParametroSkill[],
): ParametroSkill[] => {
  const names = extractNamedParams(sql);
  return names.map((nome) => {
    const prev = existing?.find((item) => item.nome === nome);
    return {
      nome,
      descricao: prev?.descricao ?? "",
      obrigatorio: prev?.obrigatorio ?? true,
      tipo: prev?.tipo ?? "string",
    };
  });
};

export const mergeParamInput = (
  base: readonly ParametroSkill[],
  input?: readonly {
    nome: string;
    descricao?: string;
    obrigatorio?: boolean;
    tipo?: TipoParametroSkill;
  }[],
): ParametroSkill[] => {
  if (!input?.length) {
    return [...base];
  }
  return base.map((param) => {
    const patch = input.find((item) => item.nome === param.nome);
    if (!patch) {
      return param;
    }
    return {
      nome: param.nome,
      descricao: patch.descricao !== undefined ? patch.descricao.trim() : param.descricao,
      obrigatorio: patch.obrigatorio ?? param.obrigatorio,
      tipo: patch.tipo ?? param.tipo,
    };
  });
};

export const paramsDescribed = (params: readonly ParametroSkill[]): boolean =>
  params.every((param) => param.descricao.trim().length > 0);

export const paramsHaystack = (params: readonly ParametroSkill[]): string =>
  params.map((param) => `${param.nome} ${param.descricao} ${param.tipo}`).join(" ");

export const countConflitosGrafo = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
): Promise<number> => grafo.countConflitos(agentId);

export const missingGraphTables = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  nomes: readonly string[],
): Promise<string[]> => {
  const missing: string[] = [];
  for (const nome of nomes) {
    const tabela = await grafo.findTabelaByNome(agentId, nome);
    if (!tabela) {
      missing.push(nome);
    }
  }
  return missing;
};

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, " ").trim().toLowerCase();

const tableNamesFromSql = (sql: string): string[] => {
  try {
    return parseSqlModelo(sql).tabelas.map((tabela) => tabela.nome.toLowerCase());
  } catch {
    return [];
  }
};

export const pickSkillInProgress = (skills: readonly Skill[], preferSql?: string): Skill | null => {
  const unpublished = skills.filter((skill) => skill.status !== "publicada");
  if (unpublished.length === 0) {
    return null;
  }
  if (preferSql) {
    const wanted = normalizeSql(preferSql);
    const exact = unpublished.find((skill) => normalizeSql(skill.sqlModelo) === wanted);
    if (exact) {
      return exact;
    }
    const preferTables = tableNamesFromSql(preferSql);
    if (preferTables.length > 0) {
      const subset = unpublished.find((skill) => {
        const tables = tableNamesFromSql(skill.sqlModelo);
        return tables.length > 0 && tables.every((tabela) => preferTables.includes(tabela));
      });
      if (subset) {
        return subset;
      }
    }
  }
  return unpublished[0] ?? null;
};

const passo = (id: PassoTreinoId, status: StatusPassoTreino, hint: string): PassoTreino => ({
  id,
  status,
  hint,
});

export const buildFluxoTreino = (input: {
  treinado: boolean;
  skill: Skill | null;
  conflitosPendentes: number;
  perfilCompleto?: boolean;
  faltas?: readonly FatoIncompleto[];
}): FluxoTreino => {
  const skill = input.skill;
  const params = skill?.params ?? [];
  const paramsOk = paramsDescribed(params);
  const conflitosOk = input.conflitosPendentes === 0;
  const perfilOk = input.perfilCompleto !== false;
  const faltas = input.faltas ?? [];
  const primeiraFalta = faltas[0];

  const treinar = input.treinado
    ? passo("treinar_sql", "feito", "SQL treinado no grafo.")
    : passo("treinar_sql", "pendente", "Chame treinar_com_sql com um SELECT nomeado.");

  const criar = skill
    ? passo("criar_skill", "feito", "Skill nomeada.")
    : input.treinado
      ? passo("criar_skill", "pendente", "Nomeie a skill (criar_skill) com o SQL treinado.")
      : passo("criar_skill", "bloqueado", "Treine o SQL antes de criar a skill.");

  let descrever: PassoTreino;
  if (!skill) {
    descrever = passo(
      "descrever_params",
      "bloqueado",
      "Crie a skill para descrever os placeholders.",
    );
  } else if (params.length === 0) {
    descrever = passo("descrever_params", "feito", "Esta skill não tem parâmetros.");
  } else if (paramsOk) {
    descrever = passo("descrever_params", "feito", "Parâmetros descritos.");
  } else {
    descrever = passo(
      "descrever_params",
      "pendente",
      `Descreva os params (${params
        .filter((p) => !p.descricao.trim())
        .map((p) => p.nome)
        .join(", ")}) em atualizar_skill.`,
    );
  }

  const conflitos = conflitosOk
    ? passo("resolver_conflito", "feito", "Sem conflitos pendentes no grafo.")
    : input.treinado
      ? passo(
          "resolver_conflito",
          "pendente",
          `Há ${String(input.conflitosPendentes)} conflito(s). Chame listar_conflitos para obter os ids e depois resolver_conflito.`,
        )
      : passo("resolver_conflito", "bloqueado", "Treine o SQL para ver conflitos.");

  let validar: PassoTreino;
  if (!skill) {
    validar = passo("validar_skill", "bloqueado", "Crie a skill antes de validar.");
  } else if (skill.status === "validada" || skill.status === "publicada") {
    validar = passo("validar_skill", "feito", "Skill validada no ERP (envelope vazio).");
  } else if (skill.status === "rascunho_revalidacao") {
    const motivo = skill.motivoRevalidacao?.trim();
    validar = passo(
      "validar_skill",
      "pendente",
      `${motivo ? `Revalidação: ${motivo}. ` : "Skill em rascunho_revalidacao. "}Chame validar_skill (envelope vazio) e, com o resumo, publicar_skill com confirmadoPeloUsuario: true.`,
    );
  } else {
    validar = passo(
      "validar_skill",
      "pendente",
      "Chame validar_skill (envelope vazio, sem ler dado).",
    );
  }

  const checklistPronto =
    Boolean(skill) &&
    paramsOk &&
    conflitosOk &&
    perfilOk &&
    (skill?.status === "validada" || skill?.status === "publicada");

  let publicar: PassoTreino;
  if (skill?.status === "publicada") {
    publicar = passo("publicar_skill", "feito", "Skill liberada (publicada).");
  } else if (checklistPronto && skill?.status === "validada") {
    publicar = passo(
      "publicar_skill",
      "pendente",
      "Chame publicar_skill sem confirmação para ver o resumo; só então confirme com confirmadoPeloUsuario: true.",
    );
  } else if (!perfilOk && skill?.status === "validada") {
    const hintFalta = primeiraFalta
      ? `${primeiraFalta.message} Próximo: ${primeiraFalta.nextAction}.`
      : "Perfil incompleto (tipo/formato/cardinalidade).";
    publicar = passo("publicar_skill", "bloqueado", hintFalta);
  } else if (skill?.status === "rascunho_revalidacao") {
    publicar = passo(
      "publicar_skill",
      "bloqueado",
      "Revalide com validar_skill (status vira validada) e só então publique com confirmação.",
    );
  } else {
    publicar = passo(
      "publicar_skill",
      "bloqueado",
      "Conclua treino, params, conflitos e validação antes de liberar.",
    );
  }

  const passos = [treinar, criar, descrever, conflitos, validar, publicar];
  const primeiroPendente = passos.find((item) => item.status === "pendente");
  const podeLiberar =
    skill?.status === "validada" && paramsOk && conflitosOk && perfilOk && Boolean(skill);

  let passoAtual: PassoTreinoId;
  let proximoPasso: ProximoPassoTreino | null;
  if (primeiroPendente) {
    passoAtual = primeiroPendente.id;
    proximoPasso = primeiroPendente.id;
  } else if (skill?.status === "publicada") {
    passoAtual = "publicar_skill";
    proximoPasso = null;
  } else if (skill?.status === "validada" && primeiraFalta) {
    passoAtual = "publicar_skill";
    proximoPasso = primeiraFalta.nextAction;
  } else {
    passoAtual = skill ? "publicar_skill" : "treinar_sql";
    proximoPasso = null;
  }

  return {
    passoAtual,
    proximoPasso,
    podeLiberar,
    passos,
  };
};

const fluxoComConflitos = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  skill: Skill | null,
  conflitosPendentes: number,
): Promise<FluxoSkillResult> => {
  let treinado = false;
  if (skill) {
    const modelo = parseSqlModelo(skill.sqlModelo);
    const missing = await missingGraphTables(
      grafo,
      agentId,
      modelo.tabelas.map((tabela) => tabela.nome),
    );
    treinado = missing.length === 0;
  } else {
    const tabelas = await grafo.listTabelas(agentId);
    treinado = tabelas.length > 0;
  }
  let faltas: readonly FatoIncompleto[] = [];
  let perfilCompleto = true;
  if (skill && skill.escopo.tabelas.length > 0) {
    faltas = await listarFatosIncompletos(grafo, agentId, skill.escopo, {
      exigirCardinalidade: skill.escopo.relacionamentos.length > 0,
      exigirTipoColuna: skill.escopo.metricasSaida.length > 0,
    });
    perfilCompleto = faltas.filter((item) => item.kind === "perfil").length === 0;
  }
  return {
    fluxo: buildFluxoTreino({
      treinado,
      skill,
      conflitosPendentes,
      perfilCompleto,
      faltas,
    }),
    faltas,
  };
};

export const fluxoForAgentSkill = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  skill: Skill | null,
): Promise<FluxoTreino> => {
  const conflitosPendentes = await countConflitosGrafo(grafo, agentId);
  return (await fluxoComConflitos(grafo, agentId, skill, conflitosPendentes)).fluxo;
};

export const fluxoEFaltasForAgentSkill = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  skill: Skill | null,
): Promise<FluxoSkillResult> => {
  const conflitosPendentes = await countConflitosGrafo(grafo, agentId);
  return fluxoComConflitos(grafo, agentId, skill, conflitosPendentes);
};

export const fluxoForAgentSkills = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  skills: readonly Skill[],
): Promise<readonly FluxoSkillResult[]> => {
  const conflitosPendentes = await countConflitosGrafo(grafo, agentId);
  const out: FluxoSkillResult[] = [];
  for (const skill of skills) {
    out.push(await fluxoComConflitos(grafo, agentId, skill, conflitosPendentes));
  }
  return out;
};
