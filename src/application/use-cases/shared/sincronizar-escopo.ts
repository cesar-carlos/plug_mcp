import type { EscopoSkill, RelacionamentoEscopo } from "../../../domain/entities/escopo.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import type { RelacionamentoGrafo } from "../../../domain/entities/grafo.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
} from "../../../domain/entities/relacionamento.js";
import type { Skill } from "../../../domain/entities/skill.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import { escopoFromSqlModelo } from "./escopo-from-modelo.js";
import { parseSqlModelo } from "./sql-modelo.js";

const lower = (value: string): string => value.trim().toLowerCase();

const matchGrafo = (
  rel: RelacionamentoEscopo,
  grafoRels: readonly RelacionamentoGrafo[],
  nomeById: ReadonlyMap<string, string>,
): RelacionamentoGrafo | undefined => {
  const pares = paresDoRelacionamento(rel);
  const fp = fingerprintPares(pares);
  const fpInv = fingerprintParesInvertidos(pares);
  const origem = lower(rel.tabelaOrigem);
  const destino = lower(rel.tabelaDestino);
  return grafoRels.find((item) => {
    const o = lower(nomeById.get(item.tabelaOrigemId) ?? "");
    const d = lower(nomeById.get(item.tabelaDestinoId) ?? "");
    const direto = o === origem && d === destino && item.paresFingerprint === fp;
    const inverso = o === destino && d === origem && item.paresFingerprint === fpInv;
    return direto || inverso;
  });
};

export const overlayCardinalidadeDoGrafo = (
  escopo: EscopoSkill,
  grafoRels: readonly RelacionamentoGrafo[],
  nomeById: ReadonlyMap<string, string>,
): EscopoSkill => {
  const relacionamentos = escopo.relacionamentos.map((rel) => {
    const match = matchGrafo(rel, grafoRels, nomeById);
    if (!match?.cardinalidade) {
      return rel;
    }
    return { ...rel, cardinalidade: match.cardinalidade };
  });
  return { ...escopo, relacionamentos };
};

const escopoDaSkill = (skill: Skill): EscopoSkill =>
  skill.escopo.tabelas.length > 0
    ? skill.escopo
    : escopoFromSqlModelo(parseSqlModelo(skill.sqlModelo));

const relsIguais = (
  a: readonly RelacionamentoEscopo[],
  b: readonly RelacionamentoEscopo[],
): boolean => JSON.stringify(a) === JSON.stringify(b);

export const sincronizarEscopoComGrafo = async (
  skills: SkillRepositoryPort,
  grafo: GrafoRepositoryPort,
  agentId: string,
  opts?: { skillId?: string; tabelas?: readonly string[] },
): Promise<readonly Skill[]> => {
  const wantedTables = (opts?.tabelas ?? []).map(lower);
  const catalog = opts?.skillId
    ? [await skills.findById(opts.skillId)].filter((item): item is Skill => Boolean(item))
    : [...(await skills.listByAgent(agentId))];
  const grafoRels = await grafo.listRelacionamentos(agentId);
  const grafoTabelas = await grafo.listTabelas(agentId);
  const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
  const updated: Skill[] = [];
  for (const skill of catalog) {
    if (skill.agentId !== agentId) {
      continue;
    }
    const base = escopoDaSkill(skill);
    if (
      wantedTables.length > 0 &&
      !base.tabelas.some((nome) => wantedTables.includes(lower(nome)))
    ) {
      continue;
    }
    const next = overlayCardinalidadeDoGrafo(base, grafoRels, nomeById);
    if (
      relsIguais(next.relacionamentos, skill.escopo.relacionamentos) &&
      skill.escopo.tabelas.length > 0
    ) {
      continue;
    }
    updated.push(await skills.update(skill.id, { escopo: next }));
  }
  return updated;
};
