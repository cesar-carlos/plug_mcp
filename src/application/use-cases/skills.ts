import type { TreinamentoRepositoryPort } from "../../domain/ports/treinamento-repository.port.js";
import { gateTestes } from "./shared/casos-treino.js";
import { capturarConhecimentoPublicavel } from "./shared/conhecimento-publicado.js";
import { DomainError, ERROR_SOURCE } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { Acesso } from "../../domain/entities/acesso.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type {
  AnotacaoGrafo,
  FonteConhecimento,
  GovernancaConhecimento,
  Skill,
  StatusConhecimento,
  StatusSkill,
  TipoParametroSkill,
} from "../../domain/entities/skill.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import {
  PACOTE_VERSAO_ATUAL,
  overlayMetricasSaida,
  paresDoRelacionamento,
  uniaoEscopos,
  type Cardinalidade,
  type EscopoSkill,
  type MetricaSaidaPatch,
} from "../../domain/entities/escopo.js";
import {
  POLITICA_CONSULTA_DEFAULT,
  parsePoliticaConsulta,
  type PoliticaConsulta,
} from "../../domain/entities/politica-consulta.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
  paresDeInput,
} from "../../domain/entities/relacionamento.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type {
  SkillPublicacao,
  SkillPublicacaoRepositoryPort,
} from "../../domain/ports/skill-publicacao-repository.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AprendizadoRepositoryPort } from "../../domain/ports/aprendizado-repository.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../domain/ports/skill-repository.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import { requireSkillDoAcesso } from "./shared/skill-do-acesso.js";
import {
  fluxoEFaltasForAcessoSkill,
  fluxoForAcessoSkill,
  fluxoForAcessoSkills,
  mergeParamInput,
  missingGraphTables,
  paramsDescribed,
  paramsFromSql,
  type FluxoTreino,
} from "./shared/fluxo-treino.js";
import {
  countConflitosNoEscopo,
  exigirEscopoNoGrafo,
  exigirPacotePublicavel,
  listarFatosIncompletos,
  origemLicenciaPacote,
  type FatoIncompleto,
} from "./shared/gates-skill.js";
import { validarSqlNoEscopo } from "./shared/validar-escopo.js";
import { assertFanoutSeguro } from "./shared/assert-fanout.js";
import { exigirFiltroEscopoPadrao } from "./shared/escopo-filtro.js";
import { lookupSensibilidadeGrafo } from "./shared/mascarar-linhagem.js";
import { assertPrivacidadeAntesDoHub } from "./shared/assert-privacidade.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
import { persistirEscopoSeVazio } from "./shared/persistir-escopo.js";
import {
  overlayCardinalidadeDoGrafo,
  sincronizarEscopoComGrafo,
  unirEscopoSqlComPacote,
} from "./shared/sincronizar-escopo.js";
import { enriquecerPerfilCompleto, type AvisoPerfil } from "./shared/enriquecer-perfil.js";
import {
  avisoLimiteNoSqlModelo,
  bindParamsForValidation,
  parseSqlModelo,
  sqlParaOdbc,
  sqlValidacaoVazia,
} from "./shared/sql-modelo.js";
import {
  requireAcesso,
  requireAcessoAprovado,
  refreshAndRequireAcessoAprovado,
  requireUsuario,
} from "./shared/guards.js";
import { withHubAuth } from "./shared/hub-auth.js";
import { guiaDialeto } from "./shared/guia-dialeto.js";
import { parseConsultaSemantica } from "../../domain/entities/consulta-semantica.js";
import {
  maxSensibilidade,
  parseSensibilidadeColuna,
  type SensibilidadeColuna,
} from "../../domain/entities/privacidade.js";
import { compilarConsultaSemantica } from "./shared/compilar-consulta-semantica.js";
import { podarRelacionamentosSubsetNoGrafo } from "./shared/podar-relacionamentos.js";
import {
  inferirTipoJoinDoSql,
  matchRelacionamentoEscopo,
  matchRelacionamentoGrafo,
  resolverTipoJoinConfirmacao,
} from "./shared/resolver-tipo-join.js";

const FONTES_CONHECIMENTO = new Set<FonteConhecimento>([
  "usuario",
  "erp",
  "documento",
  "importacao",
  "legado",
  "outro",
]);
const STATUS_CONHECIMENTO = new Set<StatusConhecimento>(["vigente", "obsoleta"]);

export interface GovernancaConhecimentoInput {
  readonly fonteTipo?: string;
  readonly fonteReferencia?: string | null;
  readonly responsavel?: string | null;
  readonly validadoEm?: string | null;
  readonly vigenteDe?: string | null;
  readonly vigenteAte?: string | null;
  readonly revisarEm?: string | null;
  readonly periodoRevisaoDias?: number | null;
  readonly status?: string;
}

const textoGovernanca = (
  value: string | null | undefined,
  campo: string,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const text = value.trim();
  if (text.length > 300 || pareceSegredoEmTexto(text)) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `Campo ${campo} de governança inválido.`,
      hint: "Não grave segredo, token, senha ou texto acima de 300 caracteres.",
    });
  }
  return text;
};

const dataGovernanca = (
  value: string | null | undefined,
  campo: string,
  apenasData = false,
): Date | string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const text = value.trim();
  if (apenasData) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `${campo} deve ser YYYY-MM-DD.`,
        hint: "Informe uma data ISO válida.",
      });
    }
    return text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `${campo} deve ser data ISO válida.`,
      hint: "Informe timestamp ISO-8601.",
    });
  }
  return parsed;
};

const validarTextoConhecimento = (value: string, campo: string): string => {
  const texto = value.trim();
  if (pareceSegredoEmTexto(texto)) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `${campo} parece conter um segredo e não será persistido.`,
      hint: "Remova senha, token, JWT ou credencial antes de gravar conhecimento.",
    });
  }
  return texto;
};

export const parseGovernancaConhecimento = (
  input: GovernancaConhecimentoInput | undefined,
): GovernancaConhecimento => {
  if (!input) return {};
  const fonteTipo = input.fonteTipo?.trim().toLowerCase();
  const status = input.status?.trim().toLowerCase();
  if (fonteTipo && !FONTES_CONHECIMENTO.has(fonteTipo as FonteConhecimento)) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "fonteTipo inválido.",
      hint: "Use usuario, erp, documento, importacao, legado ou outro.",
    });
  }
  if (status && !STATUS_CONHECIMENTO.has(status as StatusConhecimento)) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "status de conhecimento inválido.",
      hint: "Use vigente ou obsoleta.",
    });
  }
  const vigenteDe = dataGovernanca(input.vigenteDe, "vigenteDe", true) as string | null | undefined;
  const vigenteAte = dataGovernanca(input.vigenteAte, "vigenteAte", true) as
    string | null | undefined;
  const revisarEm = dataGovernanca(input.revisarEm, "revisarEm", true) as string | null | undefined;
  const periodoRevisaoDias = input.periodoRevisaoDias;
  if (vigenteDe && vigenteAte && vigenteDe > vigenteAte) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "vigenteDe não pode ser posterior a vigenteAte.",
      hint: "Corrija o intervalo de vigência.",
    });
  }
  if (
    periodoRevisaoDias !== undefined &&
    periodoRevisaoDias !== null &&
    (!Number.isInteger(periodoRevisaoDias) || periodoRevisaoDias < 1 || periodoRevisaoDias > 3650)
  ) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "periodoRevisaoDias deve estar entre 1 e 3650.",
      hint: "Use uma cadência inteira em dias ou limpe o campo.",
    });
  }
  return {
    ...(fonteTipo ? { fonteTipo: fonteTipo as FonteConhecimento } : {}),
    ...(input.fonteReferencia !== undefined
      ? { fonteReferencia: textoGovernanca(input.fonteReferencia, "fonteReferencia") }
      : {}),
    ...(input.responsavel !== undefined
      ? { responsavel: textoGovernanca(input.responsavel, "responsavel") }
      : {}),
    ...(input.validadoEm !== undefined
      ? { validadoEm: dataGovernanca(input.validadoEm, "validadoEm") as Date | null }
      : {}),
    ...(input.vigenteDe !== undefined ? { vigenteDe } : {}),
    ...(input.vigenteAte !== undefined ? { vigenteAte } : {}),
    ...(input.revisarEm !== undefined ? { revisarEm } : {}),
    ...(input.periodoRevisaoDias !== undefined ? { periodoRevisaoDias } : {}),
    ...(status ? { status: status as StatusConhecimento } : {}),
  };
};

interface ParamInput {
  nome?: string;
  descricao?: string;
  obrigatorio?: boolean;
  tipo?: TipoParametroSkill;
}

const normalizeParamInput = (
  input?: readonly ParamInput[],
):
  | { nome: string; descricao?: string; obrigatorio?: boolean; tipo?: TipoParametroSkill }[]
  | undefined => {
  if (!input) {
    return undefined;
  }
  return input
    .map((item) => ({
      nome: item.nome?.trim() ?? "",
      descricao: item.descricao,
      obrigatorio: item.obrigatorio,
      tipo: item.tipo,
    }))
    .filter((item) => item.nome.length > 0);
};

const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const aplicarMetricasSaida = (
  escopo: EscopoSkill,
  patch: readonly MetricaSaidaPatch[] | undefined,
): EscopoSkill => (patch && patch.length > 0 ? overlayMetricasSaida(escopo, patch) : escopo);

export interface SkillListItem {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly status: StatusSkill;
  readonly statusRascunho?: StatusSkill;
  readonly publicacaoAtivaId?: string | null;
  readonly versao: number;
  readonly motivoRevalidacao: string | null;
  readonly podeLiberar: boolean;
  readonly fluxoTreino: FluxoTreino;
  readonly faltas: readonly FatoIncompleto[];
}

export interface SkillSqlModeloItem {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly status: StatusSkill;
  readonly statusRascunho: StatusSkill;
  readonly motivoRevalidacao: string | null;
  readonly sqlModelo: string;
  readonly faltas: readonly FatoIncompleto[];
}

export interface ResumoPublicacao {
  readonly nome: string;
  readonly slug: string;
  readonly status: StatusSkill;
  readonly tabelas: readonly string[];
  readonly relacionamentos: readonly {
    readonly origem: string;
    readonly destino: string;
    readonly pares: readonly { colunaOrigem: string; colunaDestino: string }[];
    readonly cardinalidade: string | null;
  }[];
  readonly metricas: readonly { readonly alias: string; readonly definicao?: string }[];
  readonly params: readonly {
    readonly nome: string;
    readonly descricao: string;
    readonly tipo: string;
  }[];
  readonly podeLiberar: boolean;
  readonly politicaConsulta: PoliticaConsulta | null;
  readonly politicaConsultaDefault: PoliticaConsulta;
  readonly hintPolitica?: string;
}

const montarResumoPublicacao = (skill: Skill, podeLiberar: boolean): ResumoPublicacao => ({
  nome: skill.nome,
  slug: skill.slug,
  status: skill.status,
  tabelas: skill.escopo.tabelas,
  relacionamentos: skill.escopo.relacionamentos.map((rel) => ({
    origem: rel.tabelaOrigem,
    destino: rel.tabelaDestino,
    pares: [...paresDoRelacionamento(rel)],
    cardinalidade: rel.cardinalidade ?? null,
  })),
  metricas: skill.escopo.metricasSaida.map((item) => ({
    alias: item.alias,
    ...(item.definicao ? { definicao: item.definicao } : {}),
  })),
  params: skill.params.map((param) => ({
    nome: param.nome,
    descricao: param.descricao,
    tipo: param.tipo,
  })),
  podeLiberar,
  politicaConsulta: skill.politicaConsulta,
  politicaConsultaDefault: POLITICA_CONSULTA_DEFAULT,
  ...(skill.politicaConsulta
    ? {}
    : {
        hintPolitica:
          "Skill sem politicaConsulta. Na publicação confirmada o servidor grava o default (maxRows/timeoutMs). Ajuste com atualizar_skill.politicaConsulta. O default não inventa recorte empresa/filial nem exige período.",
      }),
});

export interface DiffPublicacao {
  readonly basePublicacaoVersao: number | null;
  readonly novaPublicacaoVersao: number;
  readonly primeiraPublicacao: boolean;
  readonly mudancas: readonly {
    readonly tipo: string;
    readonly operacao: "adicionado" | "removido" | "alterado";
    readonly alvo: string;
    readonly impacto: "amplia_escopo" | "reduz_escopo" | "muda_resultado" | "operacional";
  }[];
}

const pacotePublicavel = (skill: Skill, politica: PoliticaConsulta): Record<string, unknown> => ({
  slug: skill.slug,
  nome: skill.nome,
  descricao: skill.descricao,
  sqlModelo: skill.sqlModelo,
  params: skill.params,
  escopo: skill.escopo,
  pacoteVersao: skill.pacoteVersao,
  consultaSemantica: skill.consultaSemantica,
  politicaConsulta: politica,
});

const jsonCanonico = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(jsonCanonico).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jsonCanonico(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const mapPorNome = (items: readonly string[]): Set<string> =>
  new Set(items.map((item) => item.toLowerCase()));

const relacionamentoChave = (value: unknown): string => {
  const rel = value as Record<string, unknown>;
  const text = (item: unknown): string => (typeof item === "string" ? item : "");
  const pares = Array.isArray(rel.pares)
    ? rel.pares
        .map((item) => {
          const par = item as Record<string, unknown>;
          return `${text(par.colunaOrigem).toLowerCase()}=${text(par.colunaDestino).toLowerCase()}`;
        })
        .join("&")
    : `${text(rel.colunaOrigem).toLowerCase()}=${text(rel.colunaDestino).toLowerCase()}`;
  return `${text(rel.tabelaOrigem).toLowerCase()}->${text(rel.tabelaDestino).toLowerCase()}:${pares}`;
};

const objetoPorChave = (value: unknown, key: string): Map<string, Record<string, unknown>> => {
  const rows = Array.isArray(value) ? value : [];
  const out = new Map<string, Record<string, unknown>>();
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row[key] === "string" ? row[key].toLowerCase() : "";
    if (id) out.set(id, row);
  }
  return out;
};

const diffPublicacao = (
  pacote: Record<string, unknown>,
  base: SkillPublicacao | null,
): DiffPublicacao => {
  const before = (base?.pacote ?? {}) as Record<string, unknown>;
  const beforeEscopo = (before.escopo ?? {}) as Record<string, unknown>;
  const afterEscopo = (pacote.escopo ?? {}) as Record<string, unknown>;
  const tablesBefore = mapPorNome(
    Array.isArray(beforeEscopo.tabelas)
      ? beforeEscopo.tabelas.filter((x): x is string => typeof x === "string")
      : [],
  );
  const tablesAfter = mapPorNome(
    Array.isArray(afterEscopo.tabelas)
      ? afterEscopo.tabelas.filter((x): x is string => typeof x === "string")
      : [],
  );
  const mudancas: DiffPublicacao["mudancas"][number][] = [];
  const pushSetDelta = (tipo: string, beforeSet: Set<string>, afterSet: Set<string>): void => {
    for (const alvo of afterSet) {
      if (!beforeSet.has(alvo))
        mudancas.push({ tipo, operacao: "adicionado", alvo, impacto: "amplia_escopo" });
    }
    for (const alvo of beforeSet) {
      if (!afterSet.has(alvo))
        mudancas.push({ tipo, operacao: "removido", alvo, impacto: "reduz_escopo" });
    }
  };
  pushSetDelta("tabela", tablesBefore, tablesAfter);

  const colunas = (escopo: Record<string, unknown>): Set<string> => {
    const result = new Set<string>();
    const porTabela = escopo.colunasPorTabela;
    if (!porTabela || typeof porTabela !== "object") return result;
    for (const [tabela, value] of Object.entries(porTabela as Record<string, unknown>)) {
      for (const coluna of Array.isArray(value) ? value : []) {
        if (typeof coluna === "string") result.add(`${tabela}.${coluna}`.toLowerCase());
      }
    }
    return result;
  };
  pushSetDelta("coluna", colunas(beforeEscopo), colunas(afterEscopo));

  const relKey = (row: Record<string, unknown>): string => relacionamentoChave(row);
  const relBeforeKeys = new Set(
    (Array.isArray(beforeEscopo.relacionamentos) ? beforeEscopo.relacionamentos : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map(relKey),
  );
  const relAfterKeys = new Set(
    (Array.isArray(afterEscopo.relacionamentos) ? afterEscopo.relacionamentos : [])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map(relKey),
  );
  pushSetDelta("join", relBeforeKeys, relAfterKeys);
  for (const key of relAfterKeys) {
    if (!relBeforeKeys.has(key)) continue;
    const beforeRel = (
      Array.isArray(beforeEscopo.relacionamentos) ? beforeEscopo.relacionamentos : []
    ).find(
      (item) => item && typeof item === "object" && relKey(item as Record<string, unknown>) === key,
    ) as Record<string, unknown> | undefined;
    const afterRel = (
      Array.isArray(afterEscopo.relacionamentos) ? afterEscopo.relacionamentos : []
    ).find(
      (item) => item && typeof item === "object" && relKey(item as Record<string, unknown>) === key,
    ) as Record<string, unknown> | undefined;
    if (jsonCanonico(beforeRel) !== jsonCanonico(afterRel))
      mudancas.push({ tipo: "join", operacao: "alterado", alvo: key, impacto: "muda_resultado" });
  }

  const metricasBefore = objetoPorChave(beforeEscopo.metricasSaida, "alias");
  const metricasAfter = objetoPorChave(afterEscopo.metricasSaida, "alias");
  pushSetDelta("metrica", new Set(metricasBefore.keys()), new Set(metricasAfter.keys()));
  for (const [alias, item] of metricasAfter) {
    if (metricasBefore.has(alias) && jsonCanonico(metricasBefore.get(alias)) !== jsonCanonico(item))
      mudancas.push({
        tipo: "metrica",
        operacao: "alterado",
        alvo: alias,
        impacto: "muda_resultado",
      });
  }
  const paramsBefore = objetoPorChave(before.params, "nome");
  const paramsAfter = objetoPorChave(pacote.params, "nome");
  pushSetDelta("parametro", new Set(paramsBefore.keys()), new Set(paramsAfter.keys()));
  for (const [nome, item] of paramsAfter) {
    if (paramsBefore.has(nome) && jsonCanonico(paramsBefore.get(nome)) !== jsonCanonico(item))
      mudancas.push({
        tipo: "parametro",
        operacao: "alterado",
        alvo: nome,
        impacto: "operacional",
      });
  }
  const colunasBeforeRaw = beforeEscopo.colunasPorTabela;
  const colunasAfterRaw = afterEscopo.colunasPorTabela;
  if (
    colunasBeforeRaw &&
    colunasAfterRaw &&
    jsonCanonico(colunasBeforeRaw) !== jsonCanonico(colunasAfterRaw)
  ) {
    mudancas.push({
      tipo: "privacidade",
      operacao: "alterado",
      alvo: "colunasPorTabela",
      impacto: "muda_resultado",
    });
  }
  const addChanged = (
    tipo: string,
    key: string,
    impacto: DiffPublicacao["mudancas"][number]["impacto"],
  ): void => {
    if (jsonCanonico(before[key]) !== jsonCanonico(pacote[key]))
      mudancas.push({ tipo, operacao: base ? "alterado" : "adicionado", alvo: key, impacto });
  };
  addChanged("politica", "politicaConsulta", "operacional");
  addChanged("consulta_semantica", "consultaSemantica", "muda_resultado");
  addChanged("sql_modelo", "sqlModelo", "muda_resultado");
  return {
    basePublicacaoVersao: base?.publicacaoVersao ?? null,
    novaPublicacaoVersao: (base?.publicacaoVersao ?? 0) + 1,
    primeiraPublicacao: base === null,
    mudancas,
  };
};

export class CriarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      slug?: string;
      nome?: string;
      descricao?: string;
      sqlModelo?: string;
      params?: readonly ParamInput[];
      consultaSemantica?: unknown;
      politicaConsulta?: unknown;
      metricasSaida?: readonly MetricaSaidaPatch[];
    },
  ): Promise<{ success: true; skill: Skill; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = requireAcessoAprovado(await requireAcesso(this.acessos, input.acessoId, uid));
    const nome = input.nome?.trim() ?? "";
    const descricao = input.descricao?.trim() ?? "";
    const sqlModelo = input.sqlModelo?.trim() ?? "";
    if (!nome || !descricao || !sqlModelo) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "nome, descricao e sqlModelo são obrigatórios.",
        hint: "A skill nomeia um SQL de negócio já treinado. Use treinar_com_sql antes, se o grafo ainda não tiver as tabelas.",
      });
    }
    const modelo = parseSqlModelo(sqlModelo, acesso.dialeto);
    const grafoRels = await this.grafo.listRelacionamentos(acesso.id);
    const grafoTabelas = await this.grafo.listTabelas(acesso.id);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const escopo = aplicarMetricasSaida(
      overlayCardinalidadeDoGrafo(escopoFromSqlModelo(modelo), grafoRels, nomeById),
      input.metricasSaida,
    );
    const missing = await missingGraphTables(
      this.grafo,
      acesso.id,
      modelo.tabelas.map((tabela) => tabela.nome),
    );
    if (missing.length > 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "As tabelas deste SQL ainda não estão no grafo.",
        hint: `Chame treinar_com_sql antes. Tabelas ausentes: ${missing.join(", ")}.`,
      });
    }
    await exigirEscopoNoGrafo(this.grafo, acesso.id, escopo);
    const consultaSemantica = parseConsultaSemantica(input.consultaSemantica);
    if (consultaSemantica) {
      compilarConsultaSemantica(consultaSemantica, escopo);
    }
    const politicaConsulta = parsePoliticaConsulta(input.politicaConsulta);
    const params = mergeParamInput(paramsFromSql(sqlModelo), normalizeParamInput(input.params));
    const slugInput = input.slug?.trim();
    const slugNome = slugify(nome);
    const slug = (
      slugInput && slugInput.length > 0 ? slugInput : slugNome.length > 0 ? slugNome : "skill"
    ).slice(0, 80);
    const dup = await this.skills.findBySlug(acesso.id, slug);
    if (dup) {
      throw new DomainError({
        code: ERROR_CODES.CONFLICT,
        message: "Já existe skill com este slug neste acesso.",
        hint: "Use atualizar_skill ou outro slug.",
      });
    }
    const skill = await this.skills.create({
      acessoId: acesso.id,
      slug,
      nome,
      descricao,
      sqlModelo,
      params,
      escopo,
      autorUsuarioId: uid,
      pacoteVersao: PACOTE_VERSAO_ATUAL,
      consultaSemantica,
      politicaConsulta,
    });
    return {
      success: true,
      skill,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, skill),
    };
  }
}

export class AtualizarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      nome?: string;
      descricao?: string;
      slug?: string;
      sqlModelo?: string;
      params?: readonly ParamInput[];
      consultaSemantica?: unknown;
      politicaConsulta?: unknown;
      metricasSaida?: readonly MetricaSaidaPatch[];
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; skill: Skill; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
      slug: input.slug,
    });
    const skill = await this.requireSkill(acesso.id, input.skillId);
    const sqlModelo = input.sqlModelo?.trim() ? input.sqlModelo.trim() : skill.sqlModelo;
    const sqlChanged = sqlModelo !== skill.sqlModelo;
    const slugNovo = input.slug?.trim() ? input.slug.trim().slice(0, 80) : "";
    const slugChanged = slugNovo.length > 0 && slugNovo !== skill.slug;
    if (slugChanged && input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Renomear o slug exige confirmação do usuário.",
        hint: `Mostre o slug atual (${skill.slug}) e o novo (${slugNovo}). Chame de novo com confirmadoPeloUsuario: true.`,
      });
    }
    if (slugChanged) {
      const dup = await this.skills.findBySlug(acesso.id, slugNovo);
      if (dup && dup.id !== skill.id) {
        throw new DomainError({
          code: ERROR_CODES.CONFLICT,
          message: "Já existe skill com este slug neste acesso.",
          hint: "Escolha outro slug. Unique (acessoId, slug).",
        });
      }
    }
    if (sqlChanged) {
      const modelo = parseSqlModelo(sqlModelo, acesso.dialeto);
      const missing = await missingGraphTables(
        this.grafo,
        acesso.id,
        modelo.tabelas.map((tabela) => tabela.nome),
      );
      if (missing.length > 0) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "As tabelas deste SQL ainda não estão no grafo.",
          hint: `Chame treinar_com_sql antes. Tabelas ausentes: ${missing.join(", ")}.`,
        });
      }
    } else if (input.sqlModelo) {
      parseSqlModelo(sqlModelo, acesso.dialeto);
    }
    const grafoRels = await this.grafo.listRelacionamentos(acesso.id);
    const grafoTabelas = await this.grafo.listTabelas(acesso.id);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const baseParams = paramsFromSql(sqlModelo, skill.params);
    const params = mergeParamInput(baseParams, normalizeParamInput(input.params));
    const escopoBase = sqlChanged
      ? unirEscopoSqlComPacote(sqlModelo, skill.escopo, grafoRels, nomeById, acesso.dialeto)
      : skill.escopo;
    const escopoNext = aplicarMetricasSaida(escopoBase, input.metricasSaida);
    if (sqlChanged) {
      await exigirEscopoNoGrafo(this.grafo, acesso.id, escopoNext);
    }
    const consultaSemantica =
      input.consultaSemantica !== undefined
        ? parseConsultaSemantica(input.consultaSemantica)
        : skill.consultaSemantica;
    if (consultaSemantica) {
      compilarConsultaSemantica(consultaSemantica, escopoNext);
    }
    const updated = await this.skills.update(skill.id, {
      nome: input.nome?.trim() ? input.nome.trim() : skill.nome,
      descricao: input.descricao?.trim() ? input.descricao.trim() : skill.descricao,
      ...(slugChanged ? { slug: slugNovo } : {}),
      sqlModelo,
      params,
      escopo: escopoNext,
      status: sqlChanged ? "rascunho" : skill.status,
      consultaSemantica,
      politicaConsulta:
        input.politicaConsulta !== undefined
          ? parsePoliticaConsulta(input.politicaConsulta)
          : skill.politicaConsulta,
    });
    if (input.politicaConsulta !== undefined && skill.publicacaoAtivaId) {
      const active = await this.skills.findPublicadaById(skill.id);
      const before = active?.politicaConsulta ?? POLITICA_CONSULTA_DEFAULT;
      const after = updated.politicaConsulta;
      if (
        after &&
        ((after.maxRows ?? Infinity) < (before.maxRows ?? Infinity) ||
          (after.timeoutMs ?? Infinity) < (before.timeoutMs ?? Infinity) ||
          (after.maxTabelas ?? Infinity) < (before.maxTabelas ?? Infinity) ||
          (after.exigirRecorteTemporal === true && before.exigirRecorteTemporal !== true))
      ) {
        await this.skills.suspenderPublicacao(skill.id);
      }
    }
    return {
      success: true,
      skill: updated,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, updated),
    };
  }

  private async requireSkill(acessoId: string, skillId?: string): Promise<Skill> {
    if (!skillId) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "skillId é obrigatório.",
        hint: "Chame listar_skills.",
      });
    }
    const skill = await this.skills.findById(skillId);
    if (skill?.acessoId !== acessoId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Use listar_skills / obter_skill.",
      });
    }
    return skill;
  }
}

export class ValidarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      params?: Record<string, unknown>;
      enriquecer?: "basico" | "completo";
    },
  ): Promise<{
    success: true;
    skill: Skill;
    statusPreservado: boolean;
    fluxoTreino: FluxoTreino;
    avisos: AvisoPerfil[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid, {
        skills: this.skills,
        skillId: input.skillId,
      }),
      uid,
    );
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Use listar_skills.",
      });
    }
    if (!paramsDescribed(skill.params)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Descreva todos os parâmetros da skill antes de validar.",
        hint: "Chame atualizar_skill com params[{ nome, descricao }] para cada placeholder :nome/@nome.",
      });
    }
    const modelo = parseSqlModelo(skill.sqlModelo, acesso.dialeto);
    const grafoRels = await this.grafo.listRelacionamentos(acesso.id);
    const grafoTabelas = await this.grafo.listTabelas(acesso.id);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const escopo = unirEscopoSqlComPacote(
      skill.sqlModelo,
      skill.escopo,
      grafoRels,
      nomeById,
      acesso.dialeto,
    );
    await exigirEscopoNoGrafo(this.grafo, acesso.id, escopo);
    validarSqlNoEscopo(skill.sqlModelo, acesso.dialeto, escopo);
    const persisted = await this.skills.update(skill.id, {
      escopo,
      pacoteVersao: PACOTE_VERSAO_ATUAL,
      motivoRevalidacao: null,
      status: skill.status,
    });
    const params = bindParamsForValidation(modelo.sql, input.params);
    await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.executeSql({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
        sql: sqlValidacaoVazia(acesso.dialeto, sqlParaOdbc(modelo.sql)),
        params,
        options: { maxRows: 1 },
      }),
    );
    const updated = await this.skills.setStatus(persisted.id, "validada");
    const avisos: AvisoPerfil[] = [];
    const avisoLimite = avisoLimiteNoSqlModelo(modelo.sql);
    if (avisoLimite) {
      avisos.push(avisoLimite);
    }
    if (input.enriquecer === "completo") {
      const perfil = await enriquecerPerfilCompleto({
        grafo: this.grafo,
        executeSql: async (sql, perfilParams) =>
          withHubAuth(this.sessions, uid, (accessToken) =>
            this.plug.executeSql({
              accessToken,
              agentId: acesso.agentId,
              clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
              sql: sqlParaOdbc(sql),
              params: perfilParams ?? {},
              options: { maxRows: 300 },
            }),
          ),
        acessoId: acesso.id,
        dialeto: acesso.dialeto,
        autorUsuarioId: uid,
        modelo,
        escopo,
        escopoPadrao: acesso.escopoPadrao ?? undefined,
      });
      avisos.push(...perfil.avisos);
    }
    const [sincronizada] = await sincronizarEscopoComGrafo(this.skills, this.grafo, acesso.id, {
      skillId: updated.id,
    });
    const skillFinal = sincronizada ?? updated;
    return {
      success: true,
      skill: skillFinal,
      statusPreservado: Boolean(skill.publicacaoAtivaId),
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, skillFinal),
      avisos,
    };
  }
}

export class PublicarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly publicacoes?: SkillPublicacaoRepositoryPort,
    private readonly crypto?: CryptoPort,
    private readonly notasPublicacao?: AnotacaoGrafoRepositoryPort,
    private readonly treinamentoRepo?: TreinamentoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      confirmadoPeloUsuario?: boolean;
      confirmacaoHash?: string;
    },
  ): Promise<{
    success: true;
    publicado: boolean;
    skill: Skill;
    fluxoTreino: FluxoTreino;
    resumoPublicacao: ResumoPublicacao;
    testes?: Awaited<ReturnType<typeof gateTestes>>;
    faltas: readonly FatoIncompleto[];
    diffPublicacao?: DiffPublicacao;
    confirmacaoHash?: string;
    confirmacaoPendente?: boolean;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    return this.grafo.withAcessoLock(acesso.id, async () => {
      const skill = await this.skills.findById(input.skillId ?? "");
      if (skill?.acessoId !== acesso.id) {
        throw new DomainError({
          code: ERROR_CODES.SKILL_NOT_FOUND,
          message: "Skill não encontrada neste acesso.",
          hint: "Use listar_skills.",
        });
      }
      const { fluxo, faltas } = await fluxoEFaltasForAcessoSkill(this.grafo, acesso.id, skill);
      const resumoPublicacao = montarResumoPublicacao(skill, fluxo.podeLiberar);
      const politica = skill.politicaConsulta ?? POLITICA_CONSULTA_DEFAULT;
      const pacote = {
        ...pacotePublicavel(skill, politica),
        conhecimentoPublicado: await capturarConhecimentoPublicavel(
          this.grafo,
          this.notasPublicacao,
          acesso.id,
          skill,
        ),
      };
      const testes = this.treinamentoRepo
        ? await gateTestes(this.treinamentoRepo, skill)
        : undefined;
      const base = this.publicacoes ? await this.publicacoes.latest(acesso.id, skill.id) : null;
      const diff = this.publicacoes ? diffPublicacao(pacote, base) : undefined;
      const hash =
        this.publicacoes && this.crypto
          ? this.crypto.sha256Hex(
              jsonCanonico({
                acessoId: acesso.id,
                skillId: skill.id,
                skillVersao: skill.versao,
                baseHash: base?.pacoteHash ?? null,
                publicacaoAtivaId: skill.publicacaoAtivaId ?? null,
                pacote,
                testesSignature: testes?.signature,
              }),
            )
          : undefined;
      if (input.confirmadoPeloUsuario !== true) {
        return {
          success: true,
          publicado: false,
          skill,
          fluxoTreino: fluxo,
          resumoPublicacao,
          testes,
          faltas,
          ...(diff ? { diffPublicacao: diff } : {}),
          ...(hash ? { confirmacaoHash: hash, confirmacaoPendente: true } : {}),
        };
      }
      if (this.publicacoes && hash && input.confirmacaoHash !== hash) {
        if (!input.confirmacaoHash) {
          return {
            success: true,
            publicado: false,
            skill,
            fluxoTreino: fluxo,
            resumoPublicacao,
            testes,
            faltas,
            diffPublicacao: diff!,
            confirmacaoHash: hash,
            confirmacaoPendente: true,
          };
        }
        throw new DomainError({
          code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
          message: "O pacote mudou desde o preview de publicação.",
          hint: "Revise o novo diff e confirme com o confirmacaoHash devolvido.",
          details: { diffPublicacao: diff, confirmacaoHash: hash },
        });
      }
      if (testes && !testes.liberado)
        throw new DomainError({
          code: testes.pendencias.some((p) => p.status === "reprovado")
            ? ERROR_CODES.TESTE_REPROVADO
            : testes.pendencias.some((p) => p.status === "indisponivel")
              ? ERROR_CODES.AVALIACAO_INDISPONIVEL
              : ERROR_CODES.TESTE_OBSOLETO,
          message: "Testes obrigatórios reprovados, obsoletos ou não executados.",
          hint: "Execute evaluate:skills para esta revisão.",
          details: { testes },
        });
      if (skill.status !== "validada") {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Só skill validada pode ser publicada.",
          hint: "Chame validar_skill depois de treinar_com_sql com o SQL da skill.",
        });
      }
      if (!paramsDescribed(skill.params)) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Descreva todos os parâmetros da skill antes de publicar.",
          hint: "Chame atualizar_skill com params[{ nome, descricao }] para cada placeholder :nome/@nome.",
        });
      }
      const conflitos = await countConflitosNoEscopo(this.grafo, acesso.id, skill.escopo);
      if (conflitos > 0) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Há conflitos pendentes no escopo desta skill.",
          hint: "Chame listar_conflitos e depois resolver_conflito só para tabelas/colunas/JOINs deste pacote.",
          details: { faltas },
        });
      }
      await exigirPacotePublicavel(this.grafo, acesso.id, skill.escopo, skill.sqlModelo);
      const ast = validarSqlNoEscopo(skill.sqlModelo, acesso.dialeto, skill.escopo);
      assertFanoutSeguro(ast, skill.escopo);
      exigirFiltroEscopoPadrao({
        sql: skill.sqlModelo,
        dialeto: acesso.dialeto,
        escopoPadrao: acesso.escopoPadrao,
        colunasDasTabelas: skill.escopo.colunasPorTabela,
      });
      const lookup = await lookupSensibilidadeGrafo(this.grafo, acesso.id, skill.escopo.tabelas);
      assertPrivacidadeAntesDoHub({ ast, lookup, negar: ["pessoal", "segredo"] });
      const updated =
        this.publicacoes && hash
          ? (
              await this.publicacoes.publishAtomically({
                acessoId: acesso.id,
                skillId: skill.id,
                validarTestesAtuais: this.treinamentoRepo
                  ? async () => {
                      const current = await gateTestes(this.treinamentoRepo!, skill);
                      if (!current.liberado || current.signature !== testes?.signature)
                        throw new DomainError({
                          code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
                          message: "Testes mudaram desde o preview.",
                          hint: "Execute avaliação e gere novo preview.",
                        });
                    }
                  : undefined,
                expectedSkillVersion: skill.versao,
                expectedActiveId: skill.publicacaoAtivaId ?? null,
                expectedBaseHash: base?.pacoteHash ?? null,
                pacote,
                pacoteHash: hash,
                politicaConsulta: politica,
                autorUsuarioId: uid,
              })
            ).skill
          : await (async () => {
              const withPolicy =
                skill.politicaConsulta === null
                  ? await this.skills.update(skill.id, { politicaConsulta: politica })
                  : skill;
              return this.skills.setStatus(withPolicy.id, "publicada", withPolicy.versao);
            })();
      const after = await fluxoEFaltasForAcessoSkill(this.grafo, acesso.id, updated);
      return {
        success: true,
        publicado: true,
        skill: updated,
        fluxoTreino: after.fluxo,
        resumoPublicacao: montarResumoPublicacao(updated, after.fluxo.podeLiberar),
        faltas: after.faltas,
        ...(diff ? { diffPublicacao: diff } : {}),
      };
    });
  }
}

export class DespublicarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; skillId?: string; confirmadoPeloUsuario?: boolean },
  ): Promise<{ success: true; skill: Skill; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Use listar_skills.",
      });
    }
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Despublicar exige confirmação do usuário.",
        hint: `Mostre que "${skill.nome}" (slug ${skill.slug}) deixa de consultar o ERP e volta a validada. Pacote, params e consultas aprendidas permanecem. Chame de novo com confirmadoPeloUsuario: true.`,
      });
    }
    if (!skill.publicacaoAtivaId && skill.status !== "publicada") {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Só skill publicada pode ser despublicada.",
        hint: "Despublicar rebaixa para validada. Para apagar, use remover_skill.",
      });
    }
    await this.skills.suspenderPublicacao(skill.id);
    const updated = await this.skills.setStatus(skill.id, "validada", skill.versao);
    return {
      success: true,
      skill: updated,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, updated),
    };
  }
}

export class RemoverSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly aprendizado: AprendizadoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      slug?: string;
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; skillId: string; slug: string; statusAnterior: Skill["status"] }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
      slug: input.slug,
    });
    const skill = input.skillId?.trim()
      ? await this.skills.findById(input.skillId.trim())
      : input.slug?.trim()
        ? await this.skills.findBySlug(acesso.id, input.slug.trim())
        : null;
    if (skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Use listar_skills. Passe skillId ou slug.",
      });
    }
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Remover a skill exige confirmação do usuário.",
        hint: `Mostre no chat que vai apagar "${skill.nome}" (slug ${skill.slug}, status ${skill.status}). O grafo deste acesso permanece. Chame de novo com confirmadoPeloUsuario: true.`,
      });
    }
    await this.aprendizado.desvincularSkill(acesso.id, skill.id);
    const ok = await this.skills.deleteById(skill.id);
    if (!ok) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Use listar_skills.",
      });
    }
    return {
      success: true,
      skillId: skill.id,
      slug: skill.slug,
      statusAnterior: skill.status,
    };
  }
}

export class ListarSkills {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string },
  ): Promise<{ success: true; skills: readonly SkillListItem[] }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const rows = await this.skills.listByAcesso(acesso.id);
    const fluxos = await fluxoForAcessoSkills(this.grafo, acesso.id, rows);
    return {
      success: true,
      skills: rows.map((skill, index) => {
        const packed = fluxos[index];
        const fluxoTreino = packed?.fluxo ?? {
          passoAtual: "treinar_sql" as const,
          proximoPasso: "treinar_sql" as const,
          podeLiberar: false,
          pacoteMinimo: true,
          passos: [],
        };
        return {
          id: skill.id,
          slug: skill.slug,
          nome: skill.nome,
          status: skill.publicacaoAtivaId ? "publicada" : skill.status,
          statusRascunho: skill.status,
          versao: skill.versao,
          motivoRevalidacao: skill.motivoRevalidacao,
          podeLiberar: fluxoTreino.podeLiberar,
          fluxoTreino,
          faltas: packed?.faltas ?? [],
        };
      }),
    };
  }
}

export class ListarSqlModelos {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string },
  ): Promise<{ success: true; skills: readonly SkillSqlModeloItem[] }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const rows = await this.skills.listByAcesso(acesso.id);
    const fluxos = await fluxoForAcessoSkills(this.grafo, acesso.id, rows);
    return {
      success: true,
      skills: rows.map((skill, index) => ({
        id: skill.id,
        slug: skill.slug,
        nome: skill.nome,
        status: skill.publicacaoAtivaId ? "publicada" : skill.status,
        statusRascunho: skill.status,
        motivoRevalidacao: skill.motivoRevalidacao,
        sqlModelo: skill.sqlModelo,
        faltas: fluxos[index]?.faltas ?? [],
      })),
    };
  }
}

export class ObterSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly aprendizado?: AprendizadoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      slug?: string;
      revisao?: "publicada" | "rascunho";
    },
  ): Promise<{
    success: true;
    skill: Skill;
    pacote: {
      escopo: EscopoSkill;
      colunas: {
        tabela: string;
        nome: string;
        tipo: string | null;
        nullable: boolean | null;
        papel: string | null;
        dicionario: string | null;
        formato: string | null;
        descricao: string | null;
        perfil: unknown;
        sensibilidade: string;
        origem: string;
        status: string;
      }[];
      relacionamentos: {
        origem: string;
        destino: string;
        colunaOrigem: string;
        colunaDestino: string;
        pares: { colunaOrigem: string; colunaDestino: string }[];
        tipoJoin: string;
        cardinalidade: string | null;
        descricao: string | null;
        origemFato: string;
        escopoValidacao: { empresa?: string; filial?: string } | null;
      }[];
      regras: AnotacaoGrafo[];
      metricas: AnotacaoGrafo[];
      consultasExemplo: ConsultaAprendida[];
    };
    guiaDialeto: ReturnType<typeof guiaDialeto>;
    escopoPadrao: Acesso["escopoPadrao"];
    timezone: string | null;
    fluxoTreino: FluxoTreino;
    avisos: { code: string; message: string }[];
    faltas: readonly FatoIncompleto[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid, {
        skills: this.skills,
        skillId: input.skillId,
        slug: input.slug,
      }),
      uid,
    );
    const draft = input.skillId
      ? await this.skills.findById(input.skillId)
      : input.slug
        ? await this.skills.findBySlug(acesso.id, input.slug)
        : null;
    const skill =
      draft && input.revisao !== "rascunho"
        ? ((await this.skills.findPublicadaById(draft.id)) ?? draft)
        : draft;
    if (input.revisao === "publicada" && skill?.status !== "publicada") {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_PUBLISHED,
        message: "A skill não possui uma publicação ativa.",
        hint: "Use revisao: rascunho para treinamento, ou valide e publique a revisão.",
      });
    }
    if (skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Passe skillId ou slug. Use listar_skills.",
      });
    }
    let persisted = skill;
    if (skill.status !== "publicada") {
      try {
        persisted = await persistirEscopoSeVazio(this.skills, skill);
      } catch (error) {
        if (!(error instanceof DomainError)) {
          throw error;
        }
      }
    }
    let escopo = persisted.escopo;
    if (escopo.tabelas.length === 0) {
      try {
        escopo = escopoFromSqlModelo(parseSqlModelo(persisted.sqlModelo));
      } catch (error) {
        if (!(error instanceof DomainError)) {
          throw error;
        }
      }
    }
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
      }),
    );
    const allowed = (tabela: string): boolean =>
      policy.allTables || policy.tables.some((item) => item.toLowerCase() === tabela.toLowerCase());
    const grafoTabelas = (await this.grafo.listTabelas(acesso.id)).filter(
      (tabela) =>
        allowed(tabela.nome) &&
        escopo.tabelas.some((nome) => nome.toLowerCase() === tabela.nome.toLowerCase()),
    );
    const idToNome = new Map(grafoTabelas.map((tabela) => [tabela.id, tabela.nome]));
    const authorized = (tabela: string, coluna: string): boolean => {
      const entry = Object.entries(escopo.colunasPorTabela).find(
        ([nome]) => nome.toLowerCase() === tabela.toLowerCase(),
      );
      return (entry?.[1] ?? []).some((item) => item.toLowerCase() === coluna.toLowerCase());
    };
    const colunas: {
      tabela: string;
      nome: string;
      tipo: string | null;
      nullable: boolean | null;
      papel: string | null;
      dicionario: string | null;
      formato: string | null;
      descricao: string | null;
      perfil: unknown;
      sensibilidade: string;
      origem: string;
      status: string;
    }[] = [];
    for (const tabela of grafoTabelas) {
      const cols = await this.grafo.listColunas(acesso.id, tabela.id);
      for (const coluna of cols) {
        if (!authorized(tabela.nome, coluna.nome)) {
          continue;
        }
        colunas.push({
          tabela: tabela.nome,
          nome: coluna.nome,
          tipo: coluna.tipo,
          nullable: coluna.nullable,
          papel: coluna.papel,
          dicionario: coluna.dicionario,
          formato: coluna.formato,
          descricao: coluna.descricao,
          perfil: coluna.perfil,
          sensibilidade: coluna.sensibilidade,
          origem: coluna.origem,
          status: coluna.status,
        });
      }
    }
    const relacionamentos = (await this.grafo.listRelacionamentos(acesso.id))
      .map((rel) => ({
        origem: idToNome.get(rel.tabelaOrigemId) ?? "",
        destino: idToNome.get(rel.tabelaDestinoId) ?? "",
        colunaOrigem: rel.colunaOrigem,
        colunaDestino: rel.colunaDestino,
        pares: [...rel.pares],
        tipoJoin: rel.tipoJoin,
        cardinalidade: rel.cardinalidade,
        descricao: rel.descricao,
        origemFato: rel.origem,
        escopoValidacao: rel.escopoValidacao,
      }))
      .filter((rel) => {
        if (!rel.origem || !rel.destino) {
          return false;
        }
        const fp = fingerprintPares(rel.pares);
        const fpInv = fingerprintParesInvertidos(rel.pares);
        return escopo.relacionamentos.some((item) => {
          const pares = paresDoRelacionamento(item);
          const itemFp = fingerprintPares(pares);
          const direto =
            item.tabelaOrigem.toLowerCase() === rel.origem.toLowerCase() &&
            item.tabelaDestino.toLowerCase() === rel.destino.toLowerCase() &&
            itemFp === fp;
          const inverso =
            item.tabelaOrigem.toLowerCase() === rel.destino.toLowerCase() &&
            item.tabelaDestino.toLowerCase() === rel.origem.toLowerCase() &&
            itemFp === fpInv;
          return direto || inverso;
        });
      });
    const notas = await this.anotacoes.list(acesso.id);
    const tabelasEscopo = new Set(escopo.tabelas.map((nome) => nome.toLowerCase()));
    const notasSkill = notas.filter((nota) => {
      if (nota.skillId === persisted.id) {
        return true;
      }
      if (nota.skillId) {
        return false;
      }
      if (!nota.tabelaId) {
        return false;
      }
      const tabelaNome = grafoTabelas.find((item) => item.id === nota.tabelaId)?.nome;
      return tabelaNome ? tabelasEscopo.has(tabelaNome.toLowerCase()) : false;
    });
    const consultasExemplo = this.aprendizado
      ? await this.aprendizado.listarConsultasDaSkill(acesso.id, persisted.id, 8)
      : [];
    const avisos: { code: string; message: string }[] = [];
    const faltas = await listarFatosIncompletos(this.grafo, acesso.id, escopo, {
      exigirCardinalidade: true,
      exigirTipoColuna: true,
    });
    const perfilFaltas = faltas.filter((item) => item.kind === "perfil");
    if (perfilFaltas.length > 0) {
      avisos.push({
        code: "PERFIL_AUSENTE",
        message: perfilFaltas.map((item) => item.message).join(" "),
      });
    }
    const protegerColuna = (coluna: (typeof colunas)[number]): (typeof colunas)[number] => {
      const atual = colunas.find(
        (item) =>
          item.tabela.toLowerCase() === coluna.tabela.toLowerCase() &&
          item.nome.toLowerCase() === coluna.nome.toLowerCase(),
      );
      const sensibilidade = maxSensibilidade([
        parseSensibilidadeColuna(coluna.sensibilidade),
        parseSensibilidadeColuna(atual?.sensibilidade),
      ]);
      const valoresPermitidos =
        sensibilidade === "livre" &&
        coluna.origem === "confirmado_usuario" &&
        coluna.status !== "conflito" &&
        Boolean(atual) &&
        atual?.origem === "confirmado_usuario" &&
        atual?.status !== "conflito";
      return {
        ...coluna,
        sensibilidade,
        perfil: valoresPermitidos ? coluna.perfil : null,
        dicionario: valoresPermitidos ? coluna.dicionario : null,
      };
    };
    const fluxoPacote = await fluxoEFaltasForAcessoSkill(this.grafo, acesso.id, persisted);
    const conhecimentoPublicado = persisted.conhecimentoPublicado
      ? {
          ...persisted.conhecimentoPublicado,
          colunas: persisted.conhecimentoPublicado.colunas
            .filter((col) => allowed(col.tabela))
            .map(protegerColuna),
          relacionamentos: persisted.conhecimentoPublicado.relacionamentos.filter(
            (rel) => allowed(rel.origem) && allowed(rel.destino),
          ),
        }
      : undefined;
    return {
      success: true,
      skill: { ...persisted, escopo, conhecimentoPublicado },
      pacote: {
        escopo,
        colunas:
          persisted.status === "publicada"
            ? (conhecimentoPublicado?.colunas ?? [])
            : colunas.map(protegerColuna),
        relacionamentos:
          persisted.status === "publicada"
            ? [...(persisted.conhecimentoPublicado?.relacionamentos ?? [])].filter(
                (rel) => allowed(rel.origem) && allowed(rel.destino),
              )
            : relacionamentos,
        regras:
          persisted.status === "publicada"
            ? [...(persisted.conhecimentoPublicado?.regras ?? [])]
            : notasSkill.filter((nota) => nota.tipo === "regra"),
        metricas:
          persisted.status === "publicada"
            ? [...(persisted.conhecimentoPublicado?.metricas ?? [])]
            : notasSkill.filter((nota) => nota.tipo === "metrica"),
        consultasExemplo: consultasExemplo.filter(
          (consulta) =>
            consulta.status === "confirmada" &&
            Boolean(consulta.publicacoes?.length) &&
            consulta.publicacoes!.every(
              (origin) =>
                origin.skillId === persisted.id &&
                origin.id === persisted.publicacaoAtivaId &&
                origin.hash === persisted.publicacaoHash,
            ),
        ),
      },
      guiaDialeto: guiaDialeto(acesso.dialeto),
      escopoPadrao: acesso.escopoPadrao,
      timezone: acesso.timezone,
      fluxoTreino: fluxoPacote.fluxo,
      avisos,
      faltas: [...faltas, ...fluxoPacote.faltas.filter((item) => item.kind === "sql")],
    };
  }
}

interface ItemConfirmarColuna {
  tabela: string;
  coluna: string;
  descricao?: string;
  dicionario?: string;
  sensibilidade?: SensibilidadeColuna;
}

export class ConfirmarColuna {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      tabela?: string;
      coluna?: string;
      descricao?: string;
      dicionario?: string;
      sensibilidade?: SensibilidadeColuna;
      colunas?: readonly {
        tabela?: string;
        coluna?: string;
        descricao?: string;
        dicionario?: string;
        sensibilidade?: SensibilidadeColuna;
      }[];
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; conflito: boolean; skill?: Skill; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    const doLote = (input.colunas ?? [])
      .map((item): ItemConfirmarColuna => ({
        tabela: item.tabela?.trim() ?? "",
        coluna: item.coluna?.trim() ?? "",
        descricao: item.descricao,
        dicionario: item.dicionario,
        sensibilidade: item.sensibilidade,
      }))
      .filter((item) => item.tabela.length > 0 && item.coluna.length > 0);
    const tabelaNome = input.tabela?.trim() ?? "";
    const colunaNome = input.coluna?.trim() ?? "";
    const items: ItemConfirmarColuna[] =
      doLote.length > 0
        ? doLote
        : tabelaNome && colunaNome
          ? [
              {
                tabela: tabelaNome,
                coluna: colunaNome,
                descricao: input.descricao,
                dicionario: input.dicionario,
                sensibilidade: input.sensibilidade,
              },
            ]
          : [];
    if (items.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tabela e coluna são obrigatórios.",
        hint: "Use colunas[] ou tabela+coluna. buscar_contexto / mapear_tabela / inspecionar_consulta.colunasNovasNoGrafo.",
      });
    }
    const temSensibilidade = items.some((item) => item.sensibilidade !== undefined);
    if (temSensibilidade && input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Gravar sensibilidade exige confirmação do usuário.",
        hint: "Mostre a classe (livre|pessoal|sensivel|segredo) e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const skillId = input.skillId?.trim() ?? "";
    const skill = skillId ? await this.skills.findById(skillId) : null;
    if (skillId && skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Confirmar coluna no pacote exige skillId do mesmo acesso.",
      });
    }
    const conflito = await this.grafo.withAcessoLock(acesso.id, async () => {
      let algum = false;
      for (const item of items) {
        const tabela = await this.grafo.findTabelaByNome(acesso.id, item.tabela);
        if (!tabela) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Tabela ainda não está no grafo.",
            hint: "Chame treinar_com_sql, mapear_tabela ou inspecionar_consulta antes de confirmar a coluna.",
          });
        }
        const result = await this.grafo.mergeColuna({
          acessoId: acesso.id,
          tabelaId: tabela.id,
          nome: item.coluna,
          descricao: item.descricao ?? null,
          dicionario: item.dicionario ?? null,
          ...(item.sensibilidade !== undefined && input.confirmadoPeloUsuario === true
            ? { sensibilidade: parseSensibilidadeColuna(item.sensibilidade) }
            : {}),
          origem: "confirmado_usuario",
          autorUsuarioId: uid,
        });
        if (item.sensibilidade !== undefined && input.confirmadoPeloUsuario === true) {
          const esperada = parseSensibilidadeColuna(item.sensibilidade);
          if (
            result.coluna.sensibilidade !== esperada ||
            result.coluna.origem !== "confirmado_usuario"
          ) {
            throw new DomainError({
              code: ERROR_CODES.VALIDATION_ERROR,
              message: "A confirmação de sensibilidade não foi gravada no grafo.",
              hint: "confirmar_coluna com confirmadoPeloUsuario aplica a classe (origem confirmado_usuario) mesmo após validado_execucao. Não trate success como alteração se a classe não mudou.",
              source: ERROR_SOURCE.mcp,
            });
          }
        }
        algum = algum || result.conflito;
      }
      return algum;
    });
    if (!skill) {
      return {
        success: true,
        conflito,
        fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, null),
      };
    }
    const colunasPorTabela: Record<string, string[]> = {};
    const tabelas: string[] = [];
    for (const item of items) {
      if (!tabelas.some((nome) => nome.toLowerCase() === item.tabela.toLowerCase())) {
        tabelas.push(item.tabela);
      }
      const lista = colunasPorTabela[item.tabela] ?? [];
      if (!lista.some((nome) => nome.toLowerCase() === item.coluna.toLowerCase())) {
        lista.push(item.coluna);
      }
      colunasPorTabela[item.tabela] = lista;
    }
    const extraEscopo: EscopoSkill = {
      tabelas,
      colunasPorTabela,
      relacionamentos: [],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    };
    const updated = await this.skills.update(skill.id, {
      escopo: uniaoEscopos([skill.escopo, extraEscopo]),
    });
    const [sincronizada] = await sincronizarEscopoComGrafo(this.skills, this.grafo, acesso.id, {
      skillId: updated.id,
    });
    const finalSkill = sincronizada ?? updated;
    return {
      success: true,
      conflito,
      skill: finalSkill,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, finalSkill),
    };
  }
}

export class AnotarGrafo {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      tabela?: string;
      skillId?: string;
      tipo?: string;
      titulo?: string;
      texto?: string;
      governanca?: GovernancaConhecimentoInput;
    },
  ): Promise<{ success: true; anotacao: AnotacaoGrafo }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    const titulo = validarTextoConhecimento(input.titulo ?? "", "titulo");
    const texto = validarTextoConhecimento(input.texto ?? "", "texto");
    if (!titulo || !texto) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "titulo e texto são obrigatórios.",
        hint: "Grave o que o usuário ensinou (código, alerta, glossário). Não invente.",
      });
    }
    let tabelaId: string | null = null;
    if (input.tabela?.trim()) {
      const tabela = await this.grafo.findTabelaByNome(acesso.id, input.tabela.trim());
      if (!tabela) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Não grave anotação global por tabela inexistente. Treine a tabela antes.",
        });
      }
      tabelaId = tabela.id;
    }
    const skillId = input.skillId?.trim() ? input.skillId.trim() : null;
    if (skillId) {
      await requireSkillDoAcesso(this.skills, skillId, acesso.id);
    }
    const anotacao = await this.anotacoes.create({
      acessoId: acesso.id,
      tabelaId,
      skillId,
      tipo: input.tipo?.trim() ? input.tipo.trim() : "uso",
      titulo,
      texto,
      autorUsuarioId: uid,
      governanca: parseGovernancaConhecimento(input.governanca),
    });
    return { success: true, anotacao };
  }
}

export class ListarAnotacoes {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      tabelaId?: string | null;
      status?: StatusConhecimento;
      somenteRevisaoPendente?: boolean;
      janelaRevisaoDias?: number;
    },
  ): Promise<{
    success: true;
    anotacoes: readonly (AnotacaoGrafo & {
      ativaAgora: boolean;
      revisao: { proximaEm: string | null; venceEm: string | null; pendente: boolean };
    })[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const janelaRevisaoDias = input.janelaRevisaoDias ?? 30;
    if (!Number.isInteger(janelaRevisaoDias) || janelaRevisaoDias < 0 || janelaRevisaoDias > 365) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "janelaRevisaoDias deve estar entre 0 e 365.",
        hint: "Use 0 para somente vencidas ou uma janela curta para antecipar revisões.",
      });
    }
    const dataNoFuso = (data: Date): string => {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: acesso.timezone ?? "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(data);
      } catch {
        return data.toISOString().slice(0, 10);
      }
    };
    const hojeNoFuso = dataNoFuso(new Date());
    const anotacoes = await this.anotacoes.list(acesso.id, input.tabelaId, undefined, {
      status: input.status,
    });
    const somarDias = (date: string, days: number): string => {
      const base = new Date(`${date}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() + days);
      return base.toISOString().slice(0, 10);
    };
    const limiteRevisao = somarDias(hojeNoFuso, janelaRevisaoDias);
    const revisar = (
      nota: AnotacaoGrafo,
    ): {
      ativaAgora: boolean;
      revisao: { proximaEm: string | null; venceEm: string | null; pendente: boolean };
    } => {
      const ativaAgora =
        nota.status !== "obsoleta" &&
        (!nota.vigenteDe || nota.vigenteDe <= hojeNoFuso) &&
        (!nota.vigenteAte || nota.vigenteAte >= hojeNoFuso);
      const base =
        nota.revisarEm ??
        (nota.validadoEm ? dataNoFuso(nota.validadoEm) : dataNoFuso(nota.updatedAt));
      const proximaEm = (() => {
        if (nota.periodoRevisaoDias && nota.periodoRevisaoDias > 0) {
          const diff = Math.floor(
            (Date.parse(`${hojeNoFuso}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000,
          );
          const ciclos = diff <= 0 ? 0 : Math.ceil(diff / nota.periodoRevisaoDias);
          return somarDias(base, ciclos * nota.periodoRevisaoDias);
        }
        return nota.revisarEm ?? null;
      })();
      const revisaoNaJanela = proximaEm !== null && proximaEm <= limiteRevisao;
      const vencimentoNaJanela =
        nota.vigenteAte !== null &&
        nota.vigenteAte !== undefined &&
        nota.vigenteAte <= limiteRevisao;
      return {
        ativaAgora,
        revisao: {
          proximaEm,
          venceEm: nota.vigenteAte ?? null,
          pendente: ativaAgora && (revisaoNaJanela || vencimentoNaJanela),
        },
      };
    };
    const decoradas = anotacoes.map((nota) => ({ ...nota, ...revisar(nota) }));
    return {
      success: true,
      anotacoes: input.somenteRevisaoPendente
        ? decoradas.filter((nota) => nota.revisao.pendente)
        : decoradas,
    };
  }
}

export class AtualizarAnotacao {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      anotacaoId?: string;
      tipo?: string;
      titulo?: string;
      texto?: string;
      governanca?: GovernancaConhecimentoInput;
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; anotacao: AnotacaoGrafo }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Atualizar anotação exige confirmação do usuário.",
        hint: "Revise a regra e chame novamente com confirmadoPeloUsuario: true.",
      });
    }
    const id = input.anotacaoId?.trim() ?? "";
    const atual = id ? await this.anotacoes.findById(id) : null;
    if (atual?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.ANOTACAO_NOT_FOUND,
        message: "Anotação não encontrada.",
        hint: "Use listar_anotacoes desta persona.",
      });
    }
    const patch = {
      ...(input.tipo !== undefined ? { tipo: input.tipo.trim() } : {}),
      ...(input.titulo !== undefined
        ? { titulo: validarTextoConhecimento(input.titulo, "titulo") }
        : {}),
      ...(input.texto !== undefined
        ? { texto: validarTextoConhecimento(input.texto, "texto") }
        : {}),
      ...parseGovernancaConhecimento(input.governanca),
    };
    if (
      Object.keys(patch).length === 0 ||
      (patch.titulo !== undefined && !patch.titulo) ||
      (patch.texto !== undefined && !patch.texto)
    ) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Informe ao menos um campo válido para atualizar.",
        hint: "titulo/texto não podem ficar vazios.",
      });
    }
    return { success: true, anotacao: await this.anotacoes.update(atual.id, patch) };
  }
}

export class RemoverAnotacao {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; anotacaoId?: string },
  ): Promise<{ success: true }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    if (!input.anotacaoId) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "anotacaoId é obrigatório.",
        hint: "Use listar_anotacoes.",
      });
    }
    const nota = await this.anotacoes.findById(input.anotacaoId);
    if (nota?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.ANOTACAO_NOT_FOUND,
        message: "Anotação não encontrada.",
        hint: "Confira o id em listar_anotacoes.",
      });
    }
    const ok = await this.anotacoes.deleteById(input.anotacaoId);
    if (!ok) {
      throw new DomainError({
        code: ERROR_CODES.ANOTACAO_NOT_FOUND,
        message: "Anotação não encontrada.",
        hint: "Confira o id em listar_anotacoes.",
      });
    }
    return { success: true };
  }
}

export class ExpandirEscopo {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      tabelas?: string[];
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; skill: Skill }> {
    const uid = requireUsuario(usuarioId);
    const acesso = requireAcessoAprovado(
      await requireAcesso(this.acessos, input.acessoId, uid, {
        skills: this.skills,
        skillId: input.skillId,
      }),
    );
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Expandir o escopo exige confirmação do usuário.",
        hint: "Mostre as tabelas novas e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Use listar_skills.",
      });
    }
    const extras = (input.tabelas ?? [])
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (extras.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Informe as tabelas a incorporar.",
        hint: "expandir_escopo exige tabelas confirmadas e o relacionamento com o pacote atual.",
      });
    }
    const missing = await missingGraphTables(this.grafo, acesso.id, extras);
    if (missing.length > 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "As tabelas ainda não estão no grafo.",
        hint: `Chame treinar_com_sql / mapear_tabela antes. Ausentes: ${missing.join(", ")}.`,
      });
    }
    const base =
      skill.escopo.tabelas.length > 0
        ? skill.escopo
        : escopoFromSqlModelo(parseSqlModelo(skill.sqlModelo));
    const grafoRels = await this.grafo.listRelacionamentos(acesso.id);
    const grafoTabelas = await this.grafo.listTabelas(acesso.id);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const conhecidas = new Set([...base.tabelas, ...extras].map((nome) => nome.toLowerCase()));
    const tocaExtra = (tabelaOrigem: string, tabelaDestino: string): boolean =>
      extras.some((nome) => nome.toLowerCase() === tabelaOrigem.toLowerCase()) ||
      extras.some((nome) => nome.toLowerCase() === tabelaDestino.toLowerCase());
    const candidatos = grafoRels
      .map((rel) => {
        const first = rel.pares[0] ?? {
          colunaOrigem: rel.colunaOrigem,
          colunaDestino: rel.colunaDestino,
        };
        return {
          tabelaOrigem: nomeById.get(rel.tabelaOrigemId) ?? "",
          colunaOrigem: first.colunaOrigem,
          tabelaDestino: nomeById.get(rel.tabelaDestinoId) ?? "",
          colunaDestino: first.colunaDestino,
          pares: rel.pares.length > 0 ? [...rel.pares] : [first],
          tipoJoin: rel.tipoJoin,
          cardinalidade: rel.cardinalidade ?? undefined,
          origem: rel.origem,
        };
      })
      .filter(
        (rel) =>
          rel.tabelaOrigem &&
          rel.tabelaDestino &&
          conhecidas.has(rel.tabelaOrigem.toLowerCase()) &&
          conhecidas.has(rel.tabelaDestino.toLowerCase()) &&
          tocaExtra(rel.tabelaOrigem, rel.tabelaDestino),
      );
    if (base.tabelas.length > 0) {
      for (const extra of extras) {
        const ligada = candidatos.some(
          (rel) =>
            rel.tabelaOrigem.toLowerCase() === extra.toLowerCase() ||
            rel.tabelaDestino.toLowerCase() === extra.toLowerCase(),
        );
        if (!ligada) {
          throw DomainError.pacote({
            code: ERROR_CODES.JOIN_DESCONHECIDO,
            message: `Tabela ${extra} não tem relacionamento com o pacote atual.`,
            hint: "Tabela sem igualdade coluna=coluna: inclua as colunas com confirmar_coluna (skillId) e consulte-a sozinha (WHERE ou agregação). Não invente JOIN — tipos diferentes não casam. confirmar_relacionamento só se houver igualdade real no ERP.",
            nextAction: "confirmar_coluna",
          });
        }
      }
    }
    const paraPacote = (rel: (typeof candidatos)[number]) => ({
      tabelaOrigem: rel.tabelaOrigem,
      colunaOrigem: rel.colunaOrigem,
      tabelaDestino: rel.tabelaDestino,
      colunaDestino: rel.colunaDestino,
      pares: rel.pares,
      tipoJoin: rel.tipoJoin,
      ...(rel.cardinalidade ? { cardinalidade: rel.cardinalidade } : {}),
    });
    const relacionamentosLicenciados = candidatos
      .filter((rel) => origemLicenciaPacote(rel.origem))
      .map(paraPacote);
    const extraEscopo: EscopoSkill = {
      tabelas: extras,
      colunasPorTabela: Object.fromEntries(
        await Promise.all(
          extras.map(async (nome) => {
            const tabela = await this.grafo.findTabelaByNome(acesso.id, nome);
            const cols = tabela ? await this.grafo.listColunas(acesso.id, tabela.id) : [];
            return [
              nome,
              cols
                .filter((coluna) => origemLicenciaPacote(coluna.origem))
                .map((coluna) => coluna.nome),
            ] as const;
          }),
        ),
      ),
      relacionamentos: candidatos.map(paraPacote),
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    };
    await exigirEscopoNoGrafo(this.grafo, acesso.id, extraEscopo);
    const updated = await this.skills.update(skill.id, {
      escopo: uniaoEscopos([base, { ...extraEscopo, relacionamentos: relacionamentosLicenciados }]),
      status: skill.status,
    });
    return { success: true, skill: updated };
  }
}

export class ConfirmarRelacionamento {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      tabelaOrigem?: string;
      colunaOrigem?: string;
      tabelaDestino?: string;
      colunaDestino?: string;
      pares?: { colunaOrigem?: string; colunaDestino?: string }[];
      tipoJoin?: string;
      cardinalidade?: Cardinalidade;
    },
  ): Promise<{ success: true; skill?: Skill; fluxoTreino: FluxoTreino; hint?: string }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    const origemNome = input.tabelaOrigem?.trim() ?? "";
    const destinoNome = input.tabelaDestino?.trim() ?? "";
    const pares = paresDeInput(input);
    if (!origemNome || !destinoNome || pares.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message:
          "tabelaOrigem, tabelaDestino e pares (ou colunaOrigem/colunaDestino) são obrigatórios.",
        hint: "Use obter_skill para ver o grafo conhecido. JOIN composto: envie pares[].",
      });
    }
    const first = pares[0]!;
    const skillId = input.skillId?.trim() ?? "";
    const skill = skillId ? await this.skills.findById(skillId) : null;
    if (skillId && skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Confirmar JOIN para consulta exige skillId do mesmo acesso.",
      });
    }
    const informado = input.tipoJoin?.trim() ? input.tipoJoin.trim() : undefined;
    const doSql = skill
      ? inferirTipoJoinDoSql(skill.sqlModelo, origemNome, destinoNome, pares)
      : undefined;
    const doEscopo = skill
      ? matchRelacionamentoEscopo(skill.escopo.relacionamentos, origemNome, destinoNome, pares)
          ?.tipoJoin
      : undefined;
    let tipoJoin = informado ?? "inner";
    const escopoValidacao = acesso.escopoPadrao
      ? {
          ...(acesso.escopoPadrao.empresa ? { empresa: acesso.escopoPadrao.empresa } : {}),
          ...(acesso.escopoPadrao.filial ? { filial: acesso.escopoPadrao.filial } : {}),
        }
      : null;
    await this.grafo.withAcessoLock(acesso.id, async () => {
      const origem = await this.grafo.findTabelaByNome(acesso.id, origemNome);
      const destino = await this.grafo.findTabelaByNome(acesso.id, destinoNome);
      if (!origem || !destino) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Chame treinar_com_sql ou mapear_tabela.",
        });
      }
      for (const par of pares) {
        await this.grafo.mergeColuna({
          acessoId: acesso.id,
          tabelaId: origem.id,
          nome: par.colunaOrigem,
          origem: "confirmado_usuario",
          autorUsuarioId: uid,
        });
        await this.grafo.mergeColuna({
          acessoId: acesso.id,
          tabelaId: destino.id,
          nome: par.colunaDestino,
          origem: "confirmado_usuario",
          autorUsuarioId: uid,
        });
      }
      const existente = matchRelacionamentoGrafo(
        await this.grafo.listRelacionamentos(acesso.id),
        origem.id,
        destino.id,
        pares,
      );
      tipoJoin = resolverTipoJoinConfirmacao({
        informado,
        doSql,
        doEscopo,
        doGrafo: existente?.tipoJoin,
      });
      await this.grafo.mergeRelacionamento({
        acessoId: acesso.id,
        tabelaOrigemId: origem.id,
        colunaOrigem: first.colunaOrigem,
        tabelaDestinoId: destino.id,
        colunaDestino: first.colunaDestino,
        pares,
        tipoJoin,
        cardinalidade: input.cardinalidade,
        escopoValidacao:
          escopoValidacao && Object.keys(escopoValidacao).length > 0 ? escopoValidacao : null,
        origem: "confirmado_usuario",
        autorUsuarioId: uid,
      });
      await podarRelacionamentosSubsetNoGrafo(this.grafo, acesso.id);
      if (input.cardinalidade) {
        for (const published of await this.skills.listPublicadas(acesso.id)) {
          const licensed = matchRelacionamentoEscopo(
            published.escopo.relacionamentos,
            origemNome,
            destinoNome,
            pares,
          );
          const reversed = licensed?.tabelaOrigem.toLowerCase() !== origemNome.toLowerCase();
          const cardinalidade =
            reversed && input.cardinalidade === "1:N"
              ? "N:1"
              : reversed && input.cardinalidade === "N:1"
                ? "1:N"
                : input.cardinalidade;
          if (licensed && licensed.cardinalidade !== cardinalidade) {
            await this.skills.suspenderPublicacao(published.id);
            await this.skills.update(published.id, {
              status: "rascunho_revalidacao",
              motivoRevalidacao: "Cardinalidade publicada alterada; valide o grão e republique.",
            });
          }
        }
      }
    });
    if (!skill) {
      return {
        success: true,
        fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, null),
        hint: "JOIN gravado só no grafo. O validador da skill publicada não vê este JOIN até confirmar_relacionamento com skillId (entra no pacote).",
      };
    }
    const extraEscopo: EscopoSkill = {
      tabelas: [origemNome, destinoNome],
      colunasPorTabela: {
        [origemNome]: pares.map((par) => par.colunaOrigem),
        [destinoNome]: pares.map((par) => par.colunaDestino),
      },
      relacionamentos: [
        {
          tabelaOrigem: origemNome,
          colunaOrigem: first.colunaOrigem,
          tabelaDestino: destinoNome,
          colunaDestino: first.colunaDestino,
          pares,
          tipoJoin,
          ...(input.cardinalidade ? { cardinalidade: input.cardinalidade } : {}),
        },
      ],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    };
    const updated = await this.skills.update(skill.id, {
      escopo: uniaoEscopos([skill.escopo, extraEscopo]),
    });
    const [sincronizada] = await sincronizarEscopoComGrafo(this.skills, this.grafo, acesso.id, {
      skillId: updated.id,
    });
    const finalSkill = sincronizada ?? updated;
    return {
      success: true,
      skill: finalSkill,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, finalSkill),
    };
  }
}

export class RemoverRelacionamento {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      tabelaOrigem?: string;
      tabelaDestino?: string;
      pares?: { colunaOrigem?: string; colunaDestino?: string }[];
      colunaOrigem?: string;
      colunaDestino?: string;
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; skill?: Skill; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid, {
      skills: this.skills,
      skillId: input.skillId,
    });
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Remover relacionamento exige confirmação do usuário.",
        hint: "Mostre o JOIN (tabelas e pares) e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const origemNome = input.tabelaOrigem?.trim() ?? "";
    const destinoNome = input.tabelaDestino?.trim() ?? "";
    const pares = paresDeInput(input);
    if (!origemNome || !destinoNome || pares.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tabelaOrigem, tabelaDestino e pares são obrigatórios.",
        hint: "Um relacionamento por chamada. Use obter_skill para ver o fingerprint.",
      });
    }
    const skillId = input.skillId?.trim() ?? "";
    const skill = skillId ? await this.skills.findById(skillId) : null;
    if (skillId && skill?.acessoId !== acesso.id) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste acesso.",
        hint: "Passe skillId do mesmo acesso ou omita para apagar só no grafo.",
      });
    }
    const fp = fingerprintPares(pares);
    const fpInv = fingerprintParesInvertidos(pares);
    let updatedSkill = skill ?? undefined;
    await this.grafo.withAcessoLock(acesso.id, async () => {
      const origem = await this.grafo.findTabelaByNome(acesso.id, origemNome);
      const destino = await this.grafo.findTabelaByNome(acesso.id, destinoNome);
      if (!origem || !destino) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Use obter_skill / listar_skills para conferir os nomes físicos.",
        });
      }
      const rels = await this.grafo.listRelacionamentos(acesso.id);
      const match = rels.find((item) => {
        const direto =
          item.tabelaOrigemId === origem.id &&
          item.tabelaDestinoId === destino.id &&
          item.paresFingerprint === fp;
        const inverso =
          item.tabelaOrigemId === destino.id &&
          item.tabelaDestinoId === origem.id &&
          item.paresFingerprint === fpInv;
        return direto || inverso;
      });
      if (!match) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Relacionamento não encontrado no grafo.",
          hint: "Confira tabelas e pares[]. Um relacionamento por chamada.",
        });
      }
      await this.grafo.deleteRelacionamento(acesso.id, match.id);
    });
    if (skill) {
      const nextRels = skill.escopo.relacionamentos.filter((rel) => {
        const relPares = paresDoRelacionamento(rel);
        const relFp = fingerprintPares(relPares);
        const sameTables =
          (rel.tabelaOrigem.toLowerCase() === origemNome.toLowerCase() &&
            rel.tabelaDestino.toLowerCase() === destinoNome.toLowerCase()) ||
          (rel.tabelaOrigem.toLowerCase() === destinoNome.toLowerCase() &&
            rel.tabelaDestino.toLowerCase() === origemNome.toLowerCase());
        return !(sameTables && (relFp === fp || relFp === fpInv));
      });
      updatedSkill = await this.skills.update(skill.id, {
        escopo: { ...skill.escopo, relacionamentos: nextRels },
      });
      await this.skills.suspenderPublicacao(skill.id);
    }
    return {
      success: true,
      skill: updatedSkill,
      fluxoTreino: await fluxoForAcessoSkill(this.grafo, acesso.id, updatedSkill ?? null),
    };
  }
}
