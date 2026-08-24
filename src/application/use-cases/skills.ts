import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../domain/ports/skill-repository.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import type { AnotacaoGrafo, Skill } from "../../domain/entities/skill.js";
import { bindParamsForValidation, parseSqlModelo, sqlValidacaoVazia } from "./shared/sql-modelo.js";
import { requireAcesso, requireAcessoAprovado, requireUsuario } from "./shared/guards.js";

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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      slug?: string;
      nome?: string;
      descricao?: string;
      sqlModelo?: string;
    },
  ): Promise<{ success: true; skill: Skill }> {
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
    parseSqlModelo(sqlModelo);
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
      autorUsuarioId: uid,
    });
    return { success: true, skill };
  }
}

export class AtualizarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      skillId?: string;
      nome?: string;
      descricao?: string;
      sqlModelo?: string;
    },
  ): Promise<{ success: true; skill: Skill }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const skill = await this.requireSkill(acesso.agentId, input.skillId);
    if (input.sqlModelo) {
      parseSqlModelo(input.sqlModelo);
    }
    const updated = await this.skills.update(skill.id, {
      nome: input.nome?.trim() ? input.nome.trim() : skill.nome,
      descricao: input.descricao?.trim() ? input.descricao.trim() : skill.descricao,
      sqlModelo: input.sqlModelo?.trim() ? input.sqlModelo.trim() : skill.sqlModelo,
    });
    return { success: true, skill: updated };
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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; skillId?: string; params?: Record<string, unknown> },
  ): Promise<{ success: true; skill: Skill }> {
    const uid = requireUsuario(usuarioId);
    const acesso = requireAcessoAprovado(await requireAcesso(this.acessos, input.acessoId, uid));
    const skill = await this.skills.findById(input.skillId ?? "");
    if (skill?.agentId !== acesso.agentId) {
      throw new DomainError({
        code: ERROR_CODES.SKILL_NOT_FOUND,
        message: "Skill não encontrada neste agentId.",
        hint: "Use listar_skills.",
      });
    }
    const modelo = parseSqlModelo(skill.sqlModelo);
    const params = bindParamsForValidation(modelo.sql, input.params);
    await this.plug.executeSql({
      accessToken: await this.sessions.getAccessToken(uid),
      agentId: acesso.agentId,
      clientToken: this.crypto.decrypt(acesso.clientTokenEnc),
      sql: sqlValidacaoVazia(acesso.dialeto, modelo.sql),
      params,
      options: { maxRows: 1 },
    });
    const updated = await this.skills.setStatus(skill.id, "validada");
    return { success: true, skill: updated };
  }
}

export class PublicarSkill {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; skillId?: string },
  ): Promise<{ success: true; skill: Skill }> {
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
    if (skill.status !== "validada") {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Só skill validada pode ser publicada.",
        hint: "Chame validar_skill depois de treinar_com_sql com o SQL da skill.",
      });
    }
    const updated = await this.skills.setStatus(skill.id, "publicada", skill.versao);
    return { success: true, skill: updated };
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
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; skillId?: string; slug?: string },
  ): Promise<{ success: true; skill: Skill }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
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
    return { success: true, skill };
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
    input: { acessoId?: string; tabela?: string; tipo?: string; titulo?: string; texto?: string },
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
      tabelaId = tabela?.id ?? null;
    }
    const anotacao = await this.anotacoes.create({
      agentId: acesso.agentId,
      tabelaId,
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
