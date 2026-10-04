import type { PapelColuna } from "../../../domain/entities/escopo.js";
import type { Skill, StatusSkill } from "../../../domain/entities/skill.js";
import { familiaTipoFisico, tipoCompativelComPapel } from "../../../domain/entities/merge-fato.js";
import { fingerprintPares } from "../../../domain/entities/relacionamento.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import type { QueryResultCachePort } from "../../../domain/ports/query-result-cache.port.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import { queryCachePrefixForAcesso } from "./query-cache-key.js";

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

export interface DeltaAssinaturaSchema {
  readonly colunasAdicionadas: readonly string[];
  readonly colunasRemovidas: readonly string[];
  readonly tiposAlterados: readonly { coluna: string; antes: string; depois: string }[];
  readonly nulabilidadeAlterada: readonly { coluna: string; antes: boolean; depois: boolean }[];
  readonly relacionamentosAdicionados: readonly string[];
  readonly relacionamentosRemovidos: readonly string[];
}

export const assinaturaTabela = (input: {
  colunas: readonly { nome: string; tipo: string | null; nullable: boolean | null }[];
  relacionamentos: readonly {
    destino: string;
    fingerprint: string;
    tipoJoin?: string | null;
    cardinalidade?: string | null;
  }[];
}): string => {
  const cols = [...input.colunas]
    .map(
      (coluna) =>
        `${coluna.nome.toLowerCase()}:${(coluna.tipo ?? "").toLowerCase()}:${coluna.nullable === false ? "n" : "y"}`,
    )
    .sort()
    .join("|");
  const rels = [...input.relacionamentos]
    .map(
      (rel) =>
        `${rel.destino.toLowerCase()}:${rel.fingerprint}:${(rel.tipoJoin ?? "").toLowerCase()}:${(rel.cardinalidade ?? "").toLowerCase()}`,
    )
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

const parseAssinaturaRelacionamentos = (assinatura: string): Set<string> => {
  const tail = assinatura.split("#")[1] ?? "";
  return new Set(
    tail
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean),
  );
};

const identidadeRelacionamentoAssinatura = (value: string): string =>
  value.split(":").slice(0, 2).join(":");

export const deltaAssinaturaSchema = (
  anterior: string | null,
  atual: string,
): DeltaAssinaturaSchema => {
  if (!anterior) {
    return {
      colunasAdicionadas: [],
      colunasRemovidas: [],
      tiposAlterados: [],
      nulabilidadeAlterada: [],
      relacionamentosAdicionados: [],
      relacionamentosRemovidos: [],
    };
  }
  const before = parseAssinaturaColunas(anterior);
  const after = parseAssinaturaColunas(atual);
  const colunasAdicionadas = [...after.keys()].filter((item) => !before.has(item));
  const colunasRemovidas = [...before.keys()].filter((item) => !after.has(item));
  const tiposAlterados: { coluna: string; antes: string; depois: string }[] = [];
  const nulabilidadeAlterada: { coluna: string; antes: boolean; depois: boolean }[] = [];
  for (const [coluna, novo] of after) {
    const antigo = before.get(coluna);
    if (!antigo) continue;
    if (antigo.tipo !== novo.tipo)
      tiposAlterados.push({ coluna, antes: antigo.tipo, depois: novo.tipo });
    if (antigo.nullable !== novo.nullable)
      nulabilidadeAlterada.push({ coluna, antes: antigo.nullable, depois: novo.nullable });
  }
  const relBefore = parseAssinaturaRelacionamentos(anterior);
  const relAfter = parseAssinaturaRelacionamentos(atual);
  return {
    colunasAdicionadas,
    colunasRemovidas,
    tiposAlterados,
    nulabilidadeAlterada,
    relacionamentosAdicionados: [...relAfter].filter((item) => !relBefore.has(item)),
    relacionamentosRemovidos: [...relBefore].filter((item) => !relAfter.has(item)),
  };
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
    nullable?: boolean | null;
  }[];
  relacionamentosPacote?: readonly string[];
  relacionamentosRemovidos?: readonly string[];
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
    if (old && col.nullable === false && old.nullable !== neu.nullable) {
      return true;
    }
  }
  const pacoteRels = new Set(
    (input.relacionamentosPacote ?? []).map(identidadeRelacionamentoAssinatura),
  );
  if (
    pacoteRels.size > 0 &&
    (input.relacionamentosRemovidos ?? []).some((item) =>
      pacoteRels.has(identidadeRelacionamentoAssinatura(item)),
    )
  ) {
    return true;
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

/**
 * Materializa todas as colunas licenciadas no pacote, inclusive as que já
 * desapareceram do grafo atual. Uma remoção não pode deixar de ser comparada
 * só porque o catálogo novo deixou de retornar a coluna.
 */
const descritoresColunasPacote = (
  skills: readonly Skill[],
  tabelaNome: string,
  colunasAtuais: readonly {
    nome: string;
    tipo: string | null;
    papel: PapelColuna | null;
    nullable: boolean | null;
  }[],
): {
  nome: string;
  tipo: string | null;
  papel: PapelColuna | null;
  nullable: boolean | null;
}[] => {
  const wanted = colunasPacoteDaTabela(skills, tabelaNome);
  const atuais = new Map(colunasAtuais.map((coluna) => [coluna.nome.toLowerCase(), coluna]));
  return [...wanted].map((nome) => {
    const atual = atuais.get(nome);
    return atual ?? { nome, tipo: null, papel: null, nullable: null };
  });
};

const rebaixarSkillsDaTabela = async (input: {
  skills: SkillRepositoryPort;
  cache?: QueryResultCachePort;
  acessoId: string;
  tabelaNome: string;
  all: readonly Skill[];
  aprendizado?: AprendizadoRepositoryPort;
  delta?: DeltaAssinaturaSchema;
}): Promise<
  {
    id: string;
    slug: string;
    status: string;
    statusAnterior: string;
    statusAtual: string;
    metricasAfetadas: string[];
    consultasAprendidasAfetadas: string[];
    nextActions: string[];
  }[]
> => {
  const afetadas = skillsAfetadasPorTabela(input.all, input.tabelaNome);
  const nomesAlterados = new Set(
    [
      ...(input.delta?.colunasRemovidas ?? []),
      ...(input.delta?.tiposAlterados.map((item) => item.coluna) ?? []),
      ...(input.delta?.nulabilidadeAlterada.map((item) => item.coluna) ?? []),
    ].map((item) => item.toLowerCase()),
  );
  const saida = [];
  for (const skill of afetadas) {
    const statusAnterior = skill.status;
    let statusAtual = skill.status;
    if (skill.status === "publicada" || skill.status === "validada") {
      await input.skills.update(skill.id, {
        status: "rascunho_revalidacao",
        motivoRevalidacao: `Deriva de esquema em ${input.tabelaNome}. Revalide; o servidor não repara schema nem métrica automaticamente.`,
      });
      statusAtual = "rascunho_revalidacao";
    }
    const metricasAfetadas = skill.escopo.metricasSaida
      .filter((metrica) =>
        [...nomesAlterados].some((nome) => metrica.expr.toLowerCase().includes(nome)),
      )
      .map((metrica) => metrica.alias);
    const consultas = input.aprendizado
      ? await input.aprendizado.listarConsultasDaSkill(input.acessoId, skill.id, 100)
      : [];
    const consultasAprendidasAfetadas = consultas
      .filter((consulta) =>
        [...nomesAlterados].some((nome) => consulta.sql.toLowerCase().includes(nome)),
      )
      .map((consulta) => consulta.id);
    saida.push({
      id: skill.id,
      slug: skill.slug,
      status: statusAnterior,
      statusAnterior,
      statusAtual,
      metricasAfetadas,
      consultasAprendidasAfetadas,
      nextActions:
        statusAtual === "rascunho_revalidacao"
          ? ["validar_consulta", "validar_skill", "publicar_skill"]
          : [],
    });
  }
  if (input.cache) {
    await input.cache.deleteByPrefix(queryCachePrefixForAcesso(input.acessoId));
  }
  return saida;
};

export const aplicarDerivaEsquema = async (input: {
  grafo: GrafoRepositoryPort;
  skills: SkillRepositoryPort;
  cache?: QueryResultCachePort;
  acessoId: string;
  tabelaNome: string;
  assinatura: string;
  aprendizado?: AprendizadoRepositoryPort;
}): Promise<{
  drifted: boolean;
  mudou: boolean;
  anterior: string | null;
  delta: DeltaAssinaturaSchema;
  skillsAfetadas: Awaited<ReturnType<typeof rebaixarSkillsDaTabela>>;
}> => {
  const result = await input.grafo.saveSchemaSnapshot({
    acessoId: input.acessoId,
    tabelaNome: input.tabelaNome,
    assinatura: input.assinatura,
  });
  const delta = deltaAssinaturaSchema(result.anterior, input.assinatura);
  if (!result.drifted) {
    return {
      drifted: false,
      mudou: result.anterior !== null,
      anterior: result.anterior,
      delta,
      skillsAfetadas: [],
    };
  }
  const [drafts, active] = await Promise.all([
    input.skills.listByAcesso(input.acessoId),
    input.skills.listPublicadas(input.acessoId),
  ]);
  const all = [...active, ...drafts.filter((draft) => !active.some((pub) => pub.id === draft.id))];
  // A schema signature may change for an unused/additive field. Only a
  // removal or incompatible change that the published package actually uses
  // is blocking; compatible drift remains informational.
  const tabela = await input.grafo.findTabelaByNome(input.acessoId, input.tabelaNome);
  if (tabela) {
    const colunas = await input.grafo.listColunas(input.acessoId, tabela.id);
    const quebra = derivaQuebraPacote({
      anterior: result.anterior,
      atual: input.assinatura,
      colunasPacote: descritoresColunasPacote(all, input.tabelaNome, colunas),
      relacionamentosPacote: all
        .flatMap((skill) =>
          skill.escopo.relacionamentos
            .filter(
              (rel) =>
                rel.tabelaOrigem.toLowerCase() === input.tabelaNome.toLowerCase() ||
                rel.tabelaDestino.toLowerCase() === input.tabelaNome.toLowerCase(),
            )
            .map((rel) => {
              const destino =
                rel.tabelaOrigem.toLowerCase() === input.tabelaNome.toLowerCase()
                  ? rel.tabelaDestino
                  : rel.tabelaOrigem;
              return `${destino.toLowerCase()}:${fingerprintPares(rel.pares)}`;
            }),
        )
        .filter((item, index, items) => items.indexOf(item) === index),
      relacionamentosRemovidos: delta.relacionamentosRemovidos,
    });
    if (!quebra) {
      return {
        drifted: false,
        mudou: true,
        anterior: result.anterior,
        delta,
        skillsAfetadas: [],
      };
    }
  }
  const skillsAfetadas = await rebaixarSkillsDaTabela({
    skills: input.skills,
    cache: input.cache,
    acessoId: input.acessoId,
    tabelaNome: input.tabelaNome,
    all,
    aprendizado: input.aprendizado,
    delta,
  });
  return {
    drifted: true,
    mudou: true,
    anterior: result.anterior,
    delta,
    skillsAfetadas,
  };
};

export const aplicarDerivaTabelaNoGrafo = async (input: {
  grafo: GrafoRepositoryPort;
  skills: SkillRepositoryPort;
  cache?: QueryResultCachePort;
  acessoId: string;
  tabelaNome: string;
  aprendizado?: AprendizadoRepositoryPort;
}): Promise<{
  drifted: boolean;
  mudou: boolean;
  anterior: string | null;
  delta: DeltaAssinaturaSchema;
  skillsAfetadas: Awaited<ReturnType<typeof rebaixarSkillsDaTabela>>;
}> => {
  const tabela = await input.grafo.findTabelaByNome(input.acessoId, input.tabelaNome);
  if (!tabela) {
    return {
      drifted: false,
      mudou: false,
      anterior: null,
      delta: deltaAssinaturaSchema(null, ""),
      skillsAfetadas: [],
    };
  }
  const cols = await input.grafo.listColunas(input.acessoId, tabela.id);
  if (cols.every((coluna) => !coluna.tipo)) {
    return {
      drifted: false,
      mudou: false,
      anterior: null,
      delta: deltaAssinaturaSchema(null, ""),
      skillsAfetadas: [],
    };
  }
  const [drafts, active] = await Promise.all([
    input.skills.listByAcesso(input.acessoId),
    input.skills.listPublicadas(input.acessoId),
  ]);
  const all = [...active, ...drafts.filter((draft) => !active.some((pub) => pub.id === draft.id))];
  // Keep the complete mapped signature so additive fields are visible in the
  // diagnostic delta even when they are not licensed by a published package.
  // Licensed columns are checked separately below, including removals.
  const rels = await input.grafo.listRelacionamentos(input.acessoId);
  const tabelas = await input.grafo.listTabelas(input.acessoId);
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
        tipoJoin: rel.tipoJoin,
        cardinalidade: rel.cardinalidade,
      })),
  });
  const result = await input.grafo.saveSchemaSnapshot({
    acessoId: input.acessoId,
    tabelaNome: input.tabelaNome,
    assinatura,
  });
  const delta = deltaAssinaturaSchema(result.anterior, assinatura);
  if (!result.drifted) {
    return {
      drifted: false,
      mudou: result.anterior !== null,
      anterior: result.anterior,
      delta,
      skillsAfetadas: [],
    };
  }
  const quebra = derivaQuebraPacote({
    anterior: result.anterior,
    atual: assinatura,
    colunasPacote: descritoresColunasPacote(all, input.tabelaNome, cols),
    relacionamentosPacote: all
      .flatMap((skill) =>
        skill.escopo.relacionamentos
          .filter(
            (rel) =>
              rel.tabelaOrigem.toLowerCase() === input.tabelaNome.toLowerCase() ||
              rel.tabelaDestino.toLowerCase() === input.tabelaNome.toLowerCase(),
          )
          .map((rel) => {
            const destino =
              rel.tabelaOrigem.toLowerCase() === input.tabelaNome.toLowerCase()
                ? rel.tabelaDestino
                : rel.tabelaOrigem;
            return `${destino.toLowerCase()}:${fingerprintPares(rel.pares)}`;
          }),
      )
      .filter((item, index, items) => items.indexOf(item) === index),
    relacionamentosRemovidos: delta.relacionamentosRemovidos,
  });
  if (!quebra) {
    return { drifted: false, mudou: true, anterior: result.anterior, delta, skillsAfetadas: [] };
  }
  const skillsAfetadas = await rebaixarSkillsDaTabela({
    skills: input.skills,
    cache: input.cache,
    acessoId: input.acessoId,
    tabelaNome: input.tabelaNome,
    all,
    aprendizado: input.aprendizado,
    delta,
  });
  return {
    drifted: true,
    mudou: true,
    anterior: result.anterior,
    delta,
    skillsAfetadas,
  };
};
