import { DomainError, ERROR_SOURCE } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { Acesso } from "../../domain/entities/acesso.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type {
  AnotacaoGrafo,
  Skill,
  StatusSkill,
  TipoParametroSkill,
} from "../../domain/entities/skill.js";
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
import {
  fluxoEFaltasForAgentSkill,
  fluxoForAgentSkill,
  fluxoForAgentSkills,
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
  readonly versao: number;
  readonly motivoRevalidacao: string | null;
  readonly podeLiberar: boolean;
  readonly fluxoTreino: FluxoTreino;
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
    const grafoRels = await this.grafo.listRelacionamentos(acesso.agentId);
    const grafoTabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const escopo = aplicarMetricasSaida(
      overlayCardinalidadeDoGrafo(escopoFromSqlModelo(modelo), grafoRels, nomeById),
      input.metricasSaida,
    );
    const missing = await missingGraphTables(
      this.grafo,
      acesso.agentId,
      modelo.tabelas.map((tabela) => tabela.nome),
    );
    if (missing.length > 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "As tabelas deste SQL ainda não estão no grafo.",
        hint: `Chame treinar_com_sql antes. Tabelas ausentes: ${missing.join(", ")}.`,
      });
    }
    await exigirEscopoNoGrafo(this.grafo, acesso.agentId, escopo);
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
    const dup = await this.skills.findBySlug(acesso.agentId, slug);
    if (dup) {
      throw new DomainError({
        code: ERROR_CODES.CONFLICT,
        message: "Já existe skill com este slug neste agentId.",
        hint: "Use atualizar_skill ou outro slug.",
      });
    }
    const skill = await this.skills.create({
      agentId: acesso.agentId,
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
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, skill),
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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const skill = await this.requireSkill(acesso.agentId, input.skillId);
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
      const dup = await this.skills.findBySlug(acesso.agentId, slugNovo);
      if (dup && dup.id !== skill.id) {
        throw new DomainError({
          code: ERROR_CODES.CONFLICT,
          message: "Já existe skill com este slug neste agentId.",
          hint: "Escolha outro slug. Unique (agentId, slug).",
        });
      }
    }
    if (sqlChanged) {
      const modelo = parseSqlModelo(sqlModelo, acesso.dialeto);
      const missing = await missingGraphTables(
        this.grafo,
        acesso.agentId,
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
    const grafoRels = await this.grafo.listRelacionamentos(acesso.agentId);
    const grafoTabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const baseParams = paramsFromSql(sqlModelo, skill.params);
    const params = mergeParamInput(baseParams, normalizeParamInput(input.params));
    const escopoBase = sqlChanged
      ? unirEscopoSqlComPacote(sqlModelo, skill.escopo, grafoRels, nomeById, acesso.dialeto)
      : skill.escopo;
    const escopoNext = aplicarMetricasSaida(escopoBase, input.metricasSaida);
    if (sqlChanged) {
      await exigirEscopoNoGrafo(this.grafo, acesso.agentId, escopoNext);
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
    return {
      success: true,
      skill: updated,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, updated),
    };
  }

  private async requireSkill(agentId: string, skillId?: string): Promise<Skill> {
    if (!skillId) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "skillId é obrigatório.",
        hint: "Chame listar_skills.",
      });
    }
    const skill = await this.skills.findById(skillId);
    if (skill?.agentId !== agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
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
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
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
    const grafoRels = await this.grafo.listRelacionamentos(acesso.agentId);
    const grafoTabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const escopo = unirEscopoSqlComPacote(
      skill.sqlModelo,
      skill.escopo,
      grafoRels,
      nomeById,
      acesso.dialeto,
    );
    await exigirEscopoNoGrafo(this.grafo, acesso.agentId, escopo);
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
    const preservarPublicada = persisted.status === "publicada";
    const updated = preservarPublicada
      ? persisted
      : await this.skills.setStatus(persisted.id, "validada");
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
        agentId: acesso.agentId,
        dialeto: acesso.dialeto,
        autorUsuarioId: uid,
        modelo,
        escopo,
        escopoPadrao: acesso.escopoPadrao
          ? { empresa: acesso.escopoPadrao.empresa, filial: acesso.escopoPadrao.filial }
          : undefined,
      });
      avisos.push(...perfil.avisos);
    }
    const [sincronizada] = await sincronizarEscopoComGrafo(
      this.skills,
      this.grafo,
      acesso.agentId,
      { skillId: updated.id },
    );
    const skillFinal = sincronizada ?? updated;
    return {
      success: true,
      skill: skillFinal,
      statusPreservado: preservarPublicada,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, skillFinal),
      avisos,
    };
  }
}

export class PublicarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; skillId?: string; confirmadoPeloUsuario?: boolean },
  ): Promise<{
    success: true;
    publicado: boolean;
    skill: Skill;
    fluxoTreino: FluxoTreino;
    resumoPublicacao: ResumoPublicacao;
    faltas: readonly FatoIncompleto[];
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Use listar_skills.",
      });
    }
    const { fluxo, faltas } = await fluxoEFaltasForAgentSkill(this.grafo, acesso.agentId, skill);
    const resumoPublicacao = montarResumoPublicacao(skill, fluxo.podeLiberar);
    if (input.confirmadoPeloUsuario !== true) {
      return {
        success: true,
        publicado: false,
        skill,
        fluxoTreino: fluxo,
        resumoPublicacao,
        faltas,
      };
    }
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
    const conflitos = await countConflitosNoEscopo(this.grafo, acesso.agentId, skill.escopo);
    if (conflitos > 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Há conflitos pendentes no escopo desta skill.",
        hint: "Chame listar_conflitos e depois resolver_conflito só para tabelas/colunas/JOINs deste pacote.",
        details: { faltas },
      });
    }
    await exigirPacotePublicavel(this.grafo, acesso.agentId, skill.escopo, skill.sqlModelo);
    const comPolitica = skill.politicaConsulta
      ? skill
      : await this.skills.update(skill.id, { politicaConsulta: POLITICA_CONSULTA_DEFAULT });
    const updated = await this.skills.setStatus(comPolitica.id, "publicada", comPolitica.versao);
    const after = await fluxoEFaltasForAgentSkill(this.grafo, acesso.agentId, updated);
    return {
      success: true,
      publicado: true,
      skill: updated,
      fluxoTreino: after.fluxo,
      resumoPublicacao: montarResumoPublicacao(updated, after.fluxo.podeLiberar),
      faltas: after.faltas,
    };
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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
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
    if (skill.status !== "publicada") {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Só skill publicada pode ser despublicada.",
        hint: "Despublicar rebaixa para validada. Para apagar, use remover_skill.",
      });
    }
    const updated = await this.skills.setStatus(skill.id, "validada", skill.versao);
    return {
      success: true,
      skill: updated,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, updated),
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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const skill = input.skillId?.trim()
      ? await this.skills.findById(input.skillId.trim())
      : input.slug?.trim()
        ? await this.skills.findBySlug(acesso.agentId, input.slug.trim())
        : null;
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Use listar_skills. Passe skillId ou slug.",
      });
    }
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Remover a skill exige confirmação do usuário.",
        hint: `Mostre no chat que vai apagar "${skill.nome}" (slug ${skill.slug}, status ${skill.status}). O grafo do agentId permanece. Chame de novo com confirmadoPeloUsuario: true.`,
      });
    }
    await this.aprendizado.desvincularSkill(acesso.agentId, skill.id);
    const ok = await this.skills.deleteById(skill.id);
    if (!ok) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
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
    const rows = await this.skills.listByAgent(acesso.agentId);
    const fluxos = await fluxoForAgentSkills(this.grafo, acesso.agentId, rows);
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
          status: skill.status,
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
    input: { acessoId?: string; skillId?: string; slug?: string },
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
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const skill = input.skillId
      ? await this.skills.findById(input.skillId)
      : input.slug
        ? await this.skills.findBySlug(acesso.agentId, input.slug)
        : null;
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Passe skillId ou slug. Use listar_skills.",
      });
    }
    const persisted = await persistirEscopoSeVazio(this.skills, skill);
    const escopo =
      persisted.escopo.tabelas.length > 0
        ? persisted.escopo
        : escopoFromSqlModelo(parseSqlModelo(persisted.sqlModelo));
    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
      }),
    );
    const allowed = (tabela: string): boolean =>
      policy.allTables || policy.tables.some((item) => item.toLowerCase() === tabela.toLowerCase());
    const grafoTabelas = (await this.grafo.listTabelas(acesso.agentId)).filter(
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
      const cols = await this.grafo.listColunas(tabela.id);
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
    const relacionamentos = (await this.grafo.listRelacionamentos(acesso.agentId))
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
    const notas = await this.anotacoes.list(acesso.agentId);
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
      ? await this.aprendizado.listarConsultasDaSkill(acesso.agentId, persisted.id, 8)
      : [];
    const avisos: { code: string; message: string }[] = [];
    const faltas = await listarFatosIncompletos(this.grafo, acesso.agentId, escopo, {
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
    return {
      success: true,
      skill: { ...persisted, escopo },
      pacote: {
        escopo,
        colunas,
        relacionamentos,
        regras: notasSkill.filter((nota) => nota.tipo === "regra"),
        metricas: notasSkill.filter((nota) => nota.tipo === "metrica"),
        consultasExemplo: [...consultasExemplo],
      },
      guiaDialeto: guiaDialeto(acesso.dialeto),
      escopoPadrao: acesso.escopoPadrao,
      timezone: acesso.timezone,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, persisted),
      avisos,
      faltas,
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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
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
    if (skillId && skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Confirmar coluna no pacote exige skillId do mesmo acesso.",
      });
    }
    const conflito = await this.grafo.withAgentLock(acesso.agentId, async () => {
      let algum = false;
      for (const item of items) {
        const tabela = await this.grafo.findTabelaByNome(acesso.agentId, item.tabela);
        if (!tabela) {
          throw new DomainError({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Tabela ainda não está no grafo.",
            hint: "Chame treinar_com_sql, mapear_tabela ou inspecionar_consulta antes de confirmar a coluna.",
          });
        }
        const result = await this.grafo.mergeColuna({
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
        fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, null),
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
    const [sincronizada] = await sincronizarEscopoComGrafo(
      this.skills,
      this.grafo,
      acesso.agentId,
      { skillId: updated.id },
    );
    const finalSkill = sincronizada ?? updated;
    return {
      success: true,
      conflito,
      skill: finalSkill,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, finalSkill),
    };
  }
}

export class AnotarGrafo {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
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
    },
  ): Promise<{ success: true; anotacao: AnotacaoGrafo }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const titulo = input.titulo?.trim() ?? "";
    const texto = input.texto?.trim() ?? "";
    if (!titulo || !texto) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "titulo e texto são obrigatórios.",
        hint: "Grave o que o usuário ensinou (código, alerta, glossário). Não invente.",
      });
    }
    let tabelaId: string | null = null;
    if (input.tabela?.trim()) {
      const tabela = await this.grafo.findTabelaByNome(acesso.agentId, input.tabela.trim());
      if (!tabela) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Não grave anotação global por tabela inexistente. Treine a tabela antes.",
        });
      }
      tabelaId = tabela.id;
    }
    const anotacao = await this.anotacoes.create({
      agentId: acesso.agentId,
      tabelaId,
      skillId: input.skillId?.trim() ? input.skillId.trim() : null,
      tipo: input.tipo?.trim() ? input.tipo.trim() : "uso",
      titulo,
      texto,
      autorUsuarioId: uid,
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
    input: { acessoId?: string; tabelaId?: string | null },
  ): Promise<{ success: true; anotacoes: readonly AnotacaoGrafo[] }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    return { success: true, anotacoes: await this.anotacoes.list(acesso.agentId, input.tabelaId) };
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
    await requireAcesso(this.acessos, input.acessoId, uid);
    if (!input.anotacaoId) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "anotacaoId é obrigatório.",
        hint: "Use listar_anotacoes.",
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
    const acesso = requireAcessoAprovado(await requireAcesso(this.acessos, input.acessoId, uid));
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Expandir o escopo exige confirmação do usuário.",
        hint: "Mostre as tabelas novas e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
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
    const missing = await missingGraphTables(this.grafo, acesso.agentId, extras);
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
    const grafoRels = await this.grafo.listRelacionamentos(acesso.agentId);
    const grafoTabelas = await this.grafo.listTabelas(acesso.agentId);
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
            const tabela = await this.grafo.findTabelaByNome(acesso.agentId, nome);
            const cols = tabela ? await this.grafo.listColunas(tabela.id) : [];
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
    await exigirEscopoNoGrafo(this.grafo, acesso.agentId, extraEscopo);
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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
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
    if (skillId && skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
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
    await this.grafo.withAgentLock(acesso.agentId, async () => {
      const origem = await this.grafo.findTabelaByNome(acesso.agentId, origemNome);
      const destino = await this.grafo.findTabelaByNome(acesso.agentId, destinoNome);
      if (!origem || !destino) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Chame treinar_com_sql ou mapear_tabela.",
        });
      }
      for (const par of pares) {
        await this.grafo.mergeColuna({
          tabelaId: origem.id,
          nome: par.colunaOrigem,
          origem: "confirmado_usuario",
          autorUsuarioId: uid,
        });
        await this.grafo.mergeColuna({
          tabelaId: destino.id,
          nome: par.colunaDestino,
          origem: "confirmado_usuario",
          autorUsuarioId: uid,
        });
      }
      const existente = matchRelacionamentoGrafo(
        await this.grafo.listRelacionamentos(acesso.agentId),
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
        agentId: acesso.agentId,
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
      await podarRelacionamentosSubsetNoGrafo(this.grafo, acesso.agentId);
    });
    if (!skill) {
      return {
        success: true,
        fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, null),
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
    const [sincronizada] = await sincronizarEscopoComGrafo(
      this.skills,
      this.grafo,
      acesso.agentId,
      { skillId: updated.id },
    );
    const finalSkill = sincronizada ?? updated;
    return {
      success: true,
      skill: finalSkill,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, finalSkill),
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
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
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
    if (skillId && skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Passe skillId do mesmo acesso ou omita para apagar só no grafo.",
      });
    }
    const fp = fingerprintPares(pares);
    const fpInv = fingerprintParesInvertidos(pares);
    let updatedSkill = skill ?? undefined;
    await this.grafo.withAgentLock(acesso.agentId, async () => {
      const origem = await this.grafo.findTabelaByNome(acesso.agentId, origemNome);
      const destino = await this.grafo.findTabelaByNome(acesso.agentId, destinoNome);
      if (!origem || !destino) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Use obter_skill / listar_skills para conferir os nomes físicos.",
        });
      }
      const rels = await this.grafo.listRelacionamentos(acesso.agentId);
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
      await this.grafo.deleteRelacionamento(match.id);
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
    }
    return {
      success: true,
      skill: updatedSkill,
      fluxoTreino: await fluxoForAgentSkill(this.grafo, acesso.agentId, updatedSkill ?? null),
    };
  }
}
