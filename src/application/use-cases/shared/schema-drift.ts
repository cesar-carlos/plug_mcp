import type { Skill } from "../../../domain/entities/skill.js";
import { fingerprintPares } from "../../../domain/entities/relacionamento.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../../domain/ports/query-result-cache.port.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import { queryCachePrefixForAgent } from "./query-cache-key.js";

export const assinaturaTabela = (input: {
  colunas: readonly { nome: string; tipo: string | null; nullable: boolean | null }[];
  relacionamentos: readonly { destino: string; fingerprint: string }[];
}): string => {
  const cols = [...input.colunas]
    .map((coluna) => `${coluna.nome.toLowerCase()}:${(coluna.tipo ?? "").toLowerCase()}:${coluna.nullable === false ? "n" : "y"}`)
    .sort()
    .join("|");
  const rels = [...input.relacionamentos]
    .map((rel) => `${rel.destino.toLowerCase()}:${rel.fingerprint}`)
    .sort()
    .join("|");
  return `${cols}#${rels}`;
};

export const skillsAfetadasPorTabela = (
  skills: readonly Skill[],
  tabelaNome: string,
): Skill[] => {
  const wanted = tabelaNome.toLowerCase();
  return skills.filter((skill) => skill.escopo.tabelas.some((nome) => nome.toLowerCase() === wanted));
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
  const afetadas = skillsAfetadasPorTabela(all, input.tabelaNome);
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
  return {
    drifted: true,
    anterior: result.anterior,
    skillsAfetadas: afetadas.map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      status: skill.status,
    })),
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
  const rels = await input.grafo.listRelacionamentos(input.agentId);
  const tabelas = await input.grafo.listTabelas(input.agentId);
  const nomeById = new Map(tabelas.map((item) => [item.id, item.nome]));
  const assinatura = assinaturaTabela({
    colunas: cols.map((coluna) => ({
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
  return aplicarDerivaEsquema({
    grafo: input.grafo,
    skills: input.skills,
    cache: input.cache,
    agentId: input.agentId,
    tabelaNome: input.tabelaNome,
    assinatura,
  });
};

