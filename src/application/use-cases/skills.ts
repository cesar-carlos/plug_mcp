import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { Acesso } from "../../domain/entities/acesso.js";
import type { ConsultaAprendida } from "../../domain/entities/aprendizado.js";
import type { AnotacaoGrafo, Skill, TipoParametroSkill } from "../../domain/entities/skill.js";
import {
  PACOTE_VERSAO_ATUAL,
  paresDoRelacionamento,
  uniaoEscopos,
  type Cardinalidade,
  type EscopoSkill,
} from "../../domain/entities/escopo.js";
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
  fluxoForAgentSkill,
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
} from "./shared/gates-skill.js";
import { validarSqlNoEscopo } from "./shared/validar-escopo.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
import { persistirEscopoSeVazio } from "./shared/persistir-escopo.js";
import {
  overlayCardinalidadeDoGrafo,
  sincronizarEscopoComGrafo,
} from "./shared/sincronizar-escopo.js";
import { enriquecerPerfilCompleto, type AvisoPerfil } from "./shared/enriquecer-perfil.js";
import {
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
import { parseConsultaSemantica } from "../../domain/entities/consulta-semantica.js";
import { parsePoliticaConsulta } from "../../domain/entities/politica-consulta.js";
import { compilarConsultaSemantica } from "./shared/compilar-consulta-semantica.js";
import { guiaDialeto } from "./shared/guia-dialeto.js";

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
    const modelo = parseSqlModelo(sqlModelo);
    const grafoRels = await this.grafo.listRelacionamentos(acesso.agentId);
    const grafoTabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const escopo = overlayCardinalidadeDoGrafo(
      escopoFromSqlModelo(modelo),
      grafoRels,
      nomeById,
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
      sqlModelo?: string;
      params?: readonly ParamInput[];
      consultaSemantica?: unknown;
      politicaConsulta?: unknown;
    },
  ): Promise<{ success: true; skill: Skill; fluxoTreino: FluxoTreino }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const skill = await this.requireSkill(acesso.agentId, input.skillId);
    const sqlModelo = input.sqlModelo?.trim() ? input.sqlModelo.trim() : skill.sqlModelo;
    const sqlChanged = sqlModelo !== skill.sqlModelo;
    if (sqlChanged) {
      const modelo = parseSqlModelo(sqlModelo);
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
      await exigirEscopoNoGrafo(this.grafo, acesso.agentId, escopoFromSqlModelo(modelo));
    } else if (input.sqlModelo) {
      parseSqlModelo(sqlModelo);
    }
    const baseParams = paramsFromSql(sqlModelo, skill.params);
    const params = mergeParamInput(baseParams, normalizeParamInput(input.params));
    const escopoNext = sqlChanged ? escopoFromSqlModelo(parseSqlModelo(sqlModelo)) : skill.escopo;
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
    const modelo = parseSqlModelo(skill.sqlModelo);
    const grafoRels = await this.grafo.listRelacionamentos(acesso.agentId);
    const grafoTabelas = await this.grafo.listTabelas(acesso.agentId);
    const nomeById = new Map(grafoTabelas.map((item) => [item.id, item.nome]));
    const escopo = overlayCardinalidadeDoGrafo(
      escopoFromSqlModelo(modelo),
      grafoRels,
      nomeById,
    );
    await exigirEscopoNoGrafo(this.grafo, acesso.agentId, escopo);
    if (acesso.dialeto !== "firebird") {
      validarSqlNoEscopo(skill.sqlModelo, acesso.dialeto, escopo);
    }
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
        message: "Publicar exige confirmação do usuário.",
        hint: "Mostre o resumo da skill no chat e chame de novo com confirmadoPeloUsuario: true.",
      });
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
        hint: "Chame resolver_conflito só para tabelas/colunas/JOINs deste pacote.",
      });
    }
    await exigirPacotePublicavel(this.grafo, acesso.agentId, skill.escopo, skill.sqlModelo);
    const updated = await this.skills.setStatus(skill.id, "publicada", skill.versao);
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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string },
  ): Promise<{ success: true; skills: readonly Skill[] }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    return { success: true, skills: await this.skills.listByAgent(acesso.agentId) };
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
    };
  }
}

export class ConfirmarColuna {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      tabela?: string;
      coluna?: string;
      descricao?: string;
      dicionario?: string;
    },
  ): Promise<{ success: true; conflito: boolean }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const tabelaNome = input.tabela?.trim() ?? "";
    const colunaNome = input.coluna?.trim() ?? "";
    if (!tabelaNome || !colunaNome) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tabela e coluna são obrigatórios.",
        hint: "Use buscar_contexto / mapear_tabela para obter os nomes.",
      });
    }
    return this.grafo.withAgentLock(acesso.agentId, async () => {
      const tabela = await this.grafo.findTabelaByNome(acesso.agentId, tabelaNome);
      if (!tabela) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Tabela ainda não está no grafo.",
          hint: "Chame treinar_com_sql ou mapear_tabela antes de confirmar a coluna.",
        });
      }
      const result = await this.grafo.mergeColuna({
        tabelaId: tabela.id,
        nome: colunaNome,
        descricao: input.descricao ?? null,
        dicionario: input.dicionario ?? null,
        origem: "confirmado_usuario",
        autorUsuarioId: uid,
      });
      return { success: true as const, conflito: result.conflito };
    });
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
    const relacionamentos = grafoRels
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
        };
      })
      .filter(
        (rel) =>
          rel.tabelaOrigem &&
          rel.tabelaDestino &&
          conhecidas.has(rel.tabelaOrigem.toLowerCase()) &&
          conhecidas.has(rel.tabelaDestino.toLowerCase()) &&
          (extras.some((nome) => nome.toLowerCase() === rel.tabelaOrigem.toLowerCase()) ||
            extras.some((nome) => nome.toLowerCase() === rel.tabelaDestino.toLowerCase())),
      );
    if (base.tabelas.length > 0) {
      for (const extra of extras) {
        const ligada = relacionamentos.some(
          (rel) =>
            rel.tabelaOrigem.toLowerCase() === extra.toLowerCase() ||
            rel.tabelaDestino.toLowerCase() === extra.toLowerCase(),
        );
        if (!ligada) {
          throw new DomainError({
            code: ERROR_CODES.JOIN_DESCONHECIDO,
            message: `Tabela ${extra} não tem relacionamento com o pacote atual.`,
            hint: "Confirme o JOIN com confirmar_relacionamento (skillId) antes de expandir_escopo.",
          });
        }
      }
    }
    const extraEscopo: EscopoSkill = {
      tabelas: extras,
      colunasPorTabela: Object.fromEntries(
        await Promise.all(
          extras.map(async (nome) => {
            const tabela = await this.grafo.findTabelaByNome(acesso.agentId, nome);
            const cols = tabela ? await this.grafo.listColunas(tabela.id) : [];
            return [nome, cols.map((coluna) => coluna.nome)] as const;
          }),
        ),
      ),
      relacionamentos,
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    };
    const updated = await this.skills.update(skill.id, {
      escopo: uniaoEscopos([base, extraEscopo]),
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
  ): Promise<{ success: true; skill?: Skill }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const origemNome = input.tabelaOrigem?.trim() ?? "";
    const destinoNome = input.tabelaDestino?.trim() ?? "";
    const pares = paresDeInput(input);
    if (!origemNome || !destinoNome || pares.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "tabelaOrigem, tabelaDestino e pares (ou colunaOrigem/colunaDestino) são obrigatórios.",
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
    const tipoJoin = input.tipoJoin?.trim() ? input.tipoJoin.trim() : "inner";
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
    });
    if (!skill) {
      return { success: true };
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
    return { success: true, skill: sincronizada ?? updated };
  }
}
