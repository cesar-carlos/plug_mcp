import type { PapelColuna } from "../../../domain/entities/escopo.js";
import type { Skill, StatusSkill } from "../../../domain/entities/skill.js";
import { familiaTipoFisico, tipoCompativelComPapel } from "../../../domain/entities/merge-fato.js";
import { fingerprintPares } from "../../../domain/entities/relacionamento.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../../domain/ports/query-result-cache.port.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import { queryCachePrefixForAgent } from "./query-cache-key.js";

const STATUS_PACOTE: ReadonlySet<StatusSkill> = new Set([
  "validada",
  "publicada",
  "rascunho_revalidacao",
]);

export interface ColunaAssinatura {
  readonly nome: string;
  readonly tipo: string;
  readonly nullable: boolean;
}

export const assinaturaTabela = (input: {
  colunas: readonly { nome: string; tipo: string | null; nullable: boolean | null }[];
  relacionamentos: readonly { destino: string; fingerprint: string }[];
}): string => {
  const cols = [...input.colunas]
    .map(
      (coluna) =>
        `${coluna.nome.toLowerCase()}:${(coluna.tipo ?? "").toLowerCase()}:${coluna.nullable === false ? "n" : "y"}`,
    )
    .sort()
    .join("|");
  const rels = [...input.relacionamentos]
    .map((rel) => `${rel.destino.toLowerCase()}:${rel.fingerprint}`)
    .sort()
    .join("|");
  return `${cols}#${rels}`;
};

export const parseAssinaturaColunas = (assinatura: string): Map<string, ColunaAssinatura> => {
  const head = assinatura.split("#")[0] ?? "";
  const out = new Map<string, ColunaAssinatura>();
  if (!head) {
    return out;
  }
  for (const part of head.split("|")) {
    const segs = part.split(":");
    const nome = segs[0];
    if (!nome) {
      continue;
    }
    const tipo = segs[1] ?? "";
    const nullable = segs[2] !== "n";
    out.set(nome, { nome, tipo, nullable });
  }
  return out;
};

const tipoDeltaCompativel = (
  antes: string,
  depois: string,
  papel: PapelColuna | null | undefined,
): boolean => {
  if (antes === depois) {
    return true;
  }
  if (!tipoCompativelComPapel(depois, papel)) {
    return false;
  }
  if (papel === "data" && familiaTipoFisico(depois) === "temporal") {
    return true;
  }
  return familiaTipoFisico(antes) === familiaTipoFisico(depois);
};

export const derivaQuebraPacote = (input: {
  anterior: string | null;
  atual: string;
  colunasPacote: readonly {
    nome: string;
    tipo: string | null;
    papel: PapelColuna | null;
  }[];
}): boolean => {
  if (input.anterior == null) {
    return false;
  }
  const oldCols = parseAssinaturaColunas(input.anterior);
  const newCols = parseAssinaturaColunas(input.atual);
  for (const col of input.colunasPacote) {
    const key = col.nome.toLowerCase();
    const neu = newCols.get(key);
    if (!neu) {
      return true;
    }
    if (!tipoCompativelComPapel(col.tipo, col.papel)) {
      return true;
    }
    const old = oldCols.get(key);
    if (old && !tipoDeltaCompativel(old.tipo, neu.tipo, col.papel)) {
      return true;
    }
  }
  return false;
};

export const skillsAfetadasPorTabela = (skills: readonly Skill[], tabelaNome: string): Skill[] => {
  const wanted = tabelaNome.toLowerCase();
  return skills.filter((skill) =>
    skill.escopo.tabelas.some((nome) => nome.toLowerCase() === wanted),
  );
};

const skillsComPacoteNaTabela = (skills: readonly Skill[], tabelaNome: string): Skill[] =>
  skillsAfetadasPorTabela(skills, tabelaNome).filter((skill) => STATUS_PACOTE.has(skill.status));

export const colunasPacoteDaTabela = (
  skills: readonly Skill[],
  tabelaNome: string,
): Set<string> => {
  const wanted = tabelaNome.toLowerCase();
  const names = new Set<string>();
  for (const skill of skillsComPacoteNaTabela(skills, tabelaNome)) {
    for (const [tabela, cols] of Object.entries(skill.escopo.colunasPorTabela)) {
      if (tabela.toLowerCase() !== wanted) {
        continue;
      }
      for (const col of cols) {
        names.add(col.toLowerCase());
      }
    }
  }
  return names;
};

const rebaixarSkillsDaTabela = async (input: {
  skills: SkillRepositoryPort;
  cache?: QueryResultCachePort;
  agentId: string;
  tabelaNome: string;
  all: readonly Skill[];
}): Promise<{ id: string; slug: string; status: string }[]> => {
  const afetadas = skillsAfetadasPorTabela(input.all, input.tabelaNome);
  for (const skill of afetadas) {
    if (skill.status === "publicada" || skill.status === "validada") {
      await input.skills.update(skill.id, {
        status: "rascunho_revalidacao",
        motivoRevalidacao: `Deriva de esquema em ${input.tabelaNome}. Revalide; o servidor não repara schema nem métrica automaticamente.`,
      });
    }
  }
  if (input.cache) {
    await input.cache.deleteByPrefix(queryCachePrefixForAgent(input.agentId));
  }
  return afetadas.map((skill) => ({
    id: skill.id,
    slug: skill.slug,
    status: skill.status,
  }));
};

export const aplicarDerivaEsquema = async (input: {
  grafo: GrafoRepositoryPort;
  skills: SkillRepositoryPort;
  cache?: QueryResultCachePort;
  agentId: string;
  tabelaNome: string;
  assinatura: string;
}): Promise<{
  drifted: boolean;
  anterior: string | null;
  skillsAfetadas: { id: string; slug: string; status: string }[];
}> => {
  const result = await input.grafo.saveSchemaSnapshot({
    agentId: input.agentId,
    tabelaNome: input.tabelaNome,
    assinatura: input.assinatura,
  });
  if (!result.drifted) {
    return { drifted: false, anterior: result.anterior, skillsAfetadas: [] };
  }
  const all = await input.skills.listByAgent(input.agentId);
  const skillsAfetadas = await rebaixarSkillsDaTabela({
    skills: input.skills,
    cache: input.cache,
    agentId: input.agentId,
    tabelaNome: input.tabelaNome,
    all,
  });
  return {
    drifted: true,
    anterior: result.anterior,
    skillsAfetadas,
  };
};

export const aplicarDerivaTabelaNoGrafo = async (input: {
  grafo: GrafoRepositoryPort;
  skills: SkillRepositoryPort;
  cache?: QueryResultCachePort;
  agentId: string;
  tabelaNome: string;
}): Promise<{
  drifted: boolean;
  anterior: string | null;
  skillsAfetadas: { id: string; slug: string; status: string }[];
}> => {
  const tabela = await input.grafo.findTabelaByNome(input.agentId, input.tabelaNome);
  if (!tabela) {
    return { drifted: false, anterior: null, skillsAfetadas: [] };
  }
  const cols = await input.grafo.listColunas(tabela.id);
  if (cols.every((coluna) => !coluna.tipo)) {
    return { drifted: false, anterior: null, skillsAfetadas: [] };
  }
  const all = await input.skills.listByAgent(input.agentId);
  const wanted = colunasPacoteDaTabela(all, input.tabelaNome);
  const colsPacote =
    wanted.size > 0 ? cols.filter((coluna) => wanted.has(coluna.nome.toLowerCase())) : [];
  const rels = await input.grafo.listRelacionamentos(input.agentId);
  const tabelas = await input.grafo.listTabelas(input.agentId);
  const nomeById = new Map(tabelas.map((item) => [item.id, item.nome]));
  const assinatura = assinaturaTabela({
    colunas: (wanted.size > 0 ? colsPacote : cols).map((coluna) => ({
      nome: coluna.nome,
      tipo: coluna.tipo,
      nullable: coluna.nullable,
    })),
    relacionamentos: rels
      .filter((rel) => rel.tabelaOrigemId === tabela.id || rel.tabelaDestinoId === tabela.id)
      .map((rel) => ({
        destino:
          rel.tabelaOrigemId === tabela.id
            ? (nomeById.get(rel.tabelaDestinoId) ?? "")
            : (nomeById.get(rel.tabelaOrigemId) ?? ""),
        fingerprint: fingerprintPares(rel.pares),
      })),
  });
  const result = await input.grafo.saveSchemaSnapshot({
    agentId: input.agentId,
    tabelaNome: input.tabelaNome,
    assinatura,
  });
  if (!result.drifted) {
    return { drifted: false, anterior: result.anterior, skillsAfetadas: [] };
  }
  const quebra = derivaQuebraPacote({
    anterior: result.anterior,
    atual: assinatura,
    colunasPacote: cols
      .filter((coluna) => wanted.size === 0 || wanted.has(coluna.nome.toLowerCase()))
      .map((coluna) => ({ nome: coluna.nome, tipo: coluna.tipo, papel: coluna.papel })),
  });
  if (!quebra) {
    return { drifted: false, anterior: result.anterior, skillsAfetadas: [] };
  }
  const skillsAfetadas = await rebaixarSkillsDaTabela({
    skills: input.skills,
    cache: input.cache,
    agentId: input.agentId,
    tabelaNome: input.tabelaNome,
    all,
  });
  return {
    drifted: true,
    anterior: result.anterior,
    skillsAfetadas,
  };
};
