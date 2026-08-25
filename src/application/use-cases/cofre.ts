import { timingSafeEqual } from "node:crypto";
import { isDialeto, type Dialeto } from "../../domain/entities/dialeto.js";
import { toAcessoPublico, type AcessoPublico } from "../../domain/entities/acesso.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { UsuarioRepositoryPort } from "../../domain/ports/usuario-repository.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type {
  PlugHubTokens,
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import { requireAcesso, requireUsuario, statusFromHub } from "./shared/guards.js";
import { tryPutClientToken, withHubAuth } from "./shared/hub-auth.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const expiryFromTtlDays = (ttlDays: number, now = new Date()): Date | null => {
  if (ttlDays <= 0) {
    return null;
  }
  return new Date(now.getTime() + ttlDays * 86_400_000);
};

export interface SetupCodeStore {
  issue(token: string): { code: string; expiresAt: Date };
}

const equalText = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export class RegistrarAcesso {
  constructor(
    private readonly usuarios: UsuarioRepositoryPort,
    private readonly acessos: AcessoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: CryptoPort,
    private readonly setup: SetupCodeStore,
    private readonly publicBaseUrl: string,
    private readonly tokenTtlDays: number,
    private readonly sessions?: UsuarioPlugSessionPort,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: {
    email?: string;
    senha?: string;
    agentId?: string;
    dialeto?: string;
    clientToken?: string;
    nomeAmigavel?: string;
  }): Promise<{
    success: true;
    usuarioId: string;
    acessoId: string;
    statusAcesso: string;
    setupCode?: string;
    setupUrl?: string;
    hint: string;
  }> {
    const email = input.email?.trim().toLowerCase() ?? "";
    const senha = input.senha ?? "";
    const agentId = input.agentId?.trim() ?? "";
    const clientToken = input.clientToken?.trim() ?? "";
    const dialetoRaw = input.dialeto?.trim() ?? "";
    if (!EMAIL_RE.test(email) || senha.length < 8) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "E-mail e senha do Client no plug-server são obrigatórios.",
        hint: "Peça ao usuário o e-mail e a senha da conta Client já existente. O MCP não cria essa conta.",
      });
    }
    if (!UUID_RE.test(agentId) || !isDialeto(dialetoRaw)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "agentId (UUID) e dialeto são obrigatórios.",
        hint: "dialeto: mssql | sybase | postgres | firebird. O usuário informa; não infira.",
      });
    }
    if (clientToken.length < 8 || clientToken.length > 512) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "client_token é obrigatório (8–512 caracteres).",
        hint: "Peça o token SQL do agente ao admin do ERP.",
      });
    }

    let hub;
    try {
      hub = await this.plug.login(email, senha);
    } catch (error) {
      if (error instanceof DomainError && error.code === ERROR_CODES.AGENT_ACCESS_DENIED) {
        throw new DomainError({
          code: ERROR_CODES.CLIENT_NOT_ACTIVE,
          message: "O Client existe mas não está ativo no plug-server.",
          hint: "Peça ao dono do ERP para ativar o Client. Não trate como senha errada.",
        });
      }
      throw error;
    }

    await this.plug.requestAgentAccess(hub.accessToken, agentId);
    const status = await this.plug.getAgentAccessStatus(hub.accessToken, agentId);
    const statusAcesso = statusFromHub(status.state);
    const emailHash = this.crypto.sha256Hex(email);
    const clientTokenHash = this.crypto.sha256Hex(clientToken);
    const existing = await this.usuarios.findByEmailHash(emailHash);

    const persistAcesso = async (usuarioId: string) => {
      const dup = await this.acessos.findByUsuarioAgentTokenHash(
        usuarioId,
        agentId,
        clientTokenHash,
      );
      if (dup) {
        throw new DomainError({
          code: ERROR_CODES.CONFLICT,
          message: "Este acesso já está no cofre.",
          hint: "Autentique com o token MCP e chame listar_acessos.",
        });
      }
      return this.acessos.create({
        usuarioId,
        agentId,
        dialeto: dialetoRaw,
        nomeAmigavel: input.nomeAmigavel?.trim() ? input.nomeAmigavel.trim() : agentId,
        clientTokenEnc: this.crypto.encrypt(clientToken),
        clientTokenHash,
        statusAcesso,
      });
    };

    if (!existing) {
      const token = this.crypto.randomToken(32);
      const usuario = await this.usuarios.create({
        emailEnc: this.crypto.encrypt(email),
        emailHash,
        senhaEnc: this.crypto.encrypt(senha),
        tokenHash: this.crypto.sha256Hex(token),
        tokenExpiresAt: expiryFromTtlDays(this.tokenTtlDays),
      });
      const acesso = await persistAcesso(usuario.id);
      await this.afterPersist(usuario.id, hub, agentId, clientToken, statusAcesso);
      const setup = this.setup.issue(token);
      return {
        success: true,
        usuarioId: usuario.id,
        acessoId: acesso.id,
        statusAcesso,
        setupCode: setup.code,
        setupUrl: `${this.publicBaseUrl}/setup/${setup.code}`,
        hint: "Abra setupUrl no navegador, copie o token MCP e coloque em Authorization: Bearer. Não peça o token de volta no chat. Não ecoe senha nem client_token na resposta.",
      };
    }

    const senhaAtual = this.crypto.decrypt(existing.senhaEnc);
    if (!equalText(senhaAtual, senha)) {
      throw new DomainError({
        code: ERROR_CODES.CREDENTIAL_STALE,
        message: "Já existe um cofre para este e-mail com senha diferente.",
        hint: "Use o token MCP dessa conta e chame atualizar_credencial_plug, ou adicionar_acesso.",
      });
    }
    const acesso = await persistAcesso(existing.id);
    await this.afterPersist(existing.id, hub, agentId, clientToken, statusAcesso);
    return {
      success: true,
      usuarioId: existing.id,
      acessoId: acesso.id,
      statusAcesso,
      hint: "Acesso extra gravado. Continue com o token MCP já configurado. Não geramos um segundo token.",
    };
  }

  private async afterPersist(
    usuarioId: string,
    hub: PlugHubTokens,
    agentId: string,
    clientToken: string,
    statusAcesso: string,
  ): Promise<void> {
    this.sessions?.remember(usuarioId, hub);
    await tryPutClientToken(
      this.plug,
      this.logger,
      hub.accessToken,
      agentId,
      clientToken,
      statusAcesso === "pending",
    );
  }
}

export class AdicionarAcesso {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { agentId?: string; dialeto?: string; clientToken?: string; nomeAmigavel?: string },
  ): Promise<{ success: true; acesso: AcessoPublico }> {
    const uid = requireUsuario(usuarioId);
    const agentId = input.agentId?.trim() ?? "";
    const clientToken = input.clientToken?.trim() ?? "";
    const dialetoRaw = input.dialeto?.trim() ?? "";
    if (!UUID_RE.test(agentId) || !isDialeto(dialetoRaw) || clientToken.length < 8) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "agentId, dialeto e client_token são obrigatórios.",
        hint: "Não peça a senha de novo. Só agentId, dialeto e client_token.",
      });
    }
    const tokenHash = this.crypto.sha256Hex(clientToken);
    const dup = await this.acessos.findByUsuarioAgentTokenHash(uid, agentId, tokenHash);
    if (dup) {
      throw new DomainError({
        code: ERROR_CODES.CONFLICT,
        message: "Acesso duplicado.",
        hint: "Este trio usuário+agentId+client_token já existe. Use listar_acessos.",
      });
    }
    const status = await withHubAuth(this.sessions, uid, async (accessToken) => {
      await this.plug.requestAgentAccess(accessToken, agentId);
      return this.plug.getAgentAccessStatus(accessToken, agentId);
    });
    const statusAcesso = statusFromHub(status.state);
    const acesso = await this.acessos.create({
      usuarioId: uid,
      agentId,
      dialeto: dialetoRaw,
      nomeAmigavel: input.nomeAmigavel?.trim() ? input.nomeAmigavel.trim() : agentId,
      clientTokenEnc: this.crypto.encrypt(clientToken),
      clientTokenHash: tokenHash,
      statusAcesso,
    });
    await withHubAuth(this.sessions, uid, async (accessToken) => {
      await tryPutClientToken(
        this.plug,
        this.logger,
        accessToken,
        agentId,
        clientToken,
        statusAcesso === "pending",
      );
    });
    return { success: true, acesso: toAcessoPublico(acesso, clientToken) };
  }
}

export class ListarAcessos {
  constructor(private readonly acessos: AcessoRepositoryPort) {}

  async execute(
    usuarioId: string | undefined,
  ): Promise<{ success: true; acessos: AcessoPublico[] }> {
    const uid = requireUsuario(usuarioId);
    const lista = await this.acessos.listByUsuario(uid);
    return { success: true, acessos: lista.map((item) => toAcessoPublico(item)) };
  }
}

export class VerificarAcesso {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string },
  ): Promise<{ success: true; acesso: AcessoPublico; hub: unknown }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const hub = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getAgentAccessStatus(accessToken, acesso.agentId),
    );
    const statusAcesso = statusFromHub(hub.state);
    await this.acessos.updateStatus(acesso.id, statusAcesso);
    if (statusAcesso === "approved") {
      const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);
      await withHubAuth(this.sessions, uid, async (accessToken) => {
        await tryPutClientToken(
          this.plug,
          this.logger,
          accessToken,
          acesso.agentId,
          clientToken,
          false,
        );
      });
    }
    return { success: true, acesso: toAcessoPublico({ ...acesso, statusAcesso }), hub };
  }
}

export class RemoverAcesso {
  constructor(private readonly acessos: AcessoRepositoryPort) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string },
  ): Promise<{ success: true }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    await this.acessos.deleteById(acesso.id);
    return { success: true };
  }
}

export class AtualizarCredencialPlug {
  constructor(
    private readonly usuarios: UsuarioRepositoryPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { email?: string; senha?: string },
  ): Promise<{ success: true }> {
    const uid = requireUsuario(usuarioId);
    const email = input.email?.trim().toLowerCase() ?? "";
    const senha = input.senha ?? "";
    if (!EMAIL_RE.test(email) || senha.length < 8) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "E-mail e senha novos do Client são obrigatórios.",
        hint: "São as credenciais do plug-server, não um login MCP.",
      });
    }
    const tokens = await this.plug.login(email, senha);
    await this.usuarios.updateCredenciais(
      uid,
      this.crypto.encrypt(email),
      this.crypto.encrypt(senha),
    );
    this.sessions.remember(uid, tokens);
    return { success: true };
  }
}

export class AtualizarDialeto {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly skills: SkillRepositoryPort,
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; dialeto?: string; confirmadoPeloUsuario?: boolean },
  ): Promise<{
    success: true;
    dialetoAnterior: string;
    dialeto: Dialeto;
    skillsRebaixadas: number;
  }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const dialetoRaw = input.dialeto?.trim() ?? "";
    if (!isDialeto(dialetoRaw)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "dialeto inválido.",
        hint: "Use mssql, sybase, postgres ou firebird.",
      });
    }
    if (input.confirmadoPeloUsuario !== true) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Atualizar o dialeto exige confirmação do usuário.",
        hint: "Mostre que as skills do agentId voltam a rascunho e chame de novo com confirmadoPeloUsuario: true.",
      });
    }
    const dialetoAnterior = acesso.dialeto;
    if (dialetoAnterior === dialetoRaw) {
      return { success: true, dialetoAnterior, dialeto: dialetoRaw, skillsRebaixadas: 0 };
    }
    const doMesmoAgente = (await this.acessos.listByUsuario(uid)).filter(
      (item) => item.agentId === acesso.agentId,
    );
    for (const item of doMesmoAgente) {
      await this.acessos.updateDialeto(item.id, dialetoRaw);
    }
    await this.grafo.withAgentLock(acesso.agentId, async () => {
      await this.grafo.setDialeto(acesso.agentId, dialetoRaw);
    });
    const skills = await this.skills.listByAgent(acesso.agentId);
    let skillsRebaixadas = 0;
    for (const skill of skills) {
      if (skill.status === "rascunho") {
        continue;
      }
      await this.skills.setStatus(skill.id, "rascunho");
      skillsRebaixadas += 1;
    }
    return { success: true, dialetoAnterior, dialeto: dialetoRaw, skillsRebaixadas };
  }
}

export class RotacionarTokenMcp {
  constructor(
    private readonly usuarios: UsuarioRepositoryPort,
    private readonly crypto: CryptoPort,
    private readonly setup: SetupCodeStore,
    private readonly publicBaseUrl: string,
    private readonly tokenTtlDays: number,
  ) {}

  async execute(usuarioId: string | undefined): Promise<{
    success: true;
    setupCode: string;
    setupUrl: string;
  }> {
    const uid = requireUsuario(usuarioId);
    const token = this.crypto.randomToken(32);
    await this.usuarios.updateTokenHash(
      uid,
      this.crypto.sha256Hex(token),
      expiryFromTtlDays(this.tokenTtlDays),
    );
    const setup = this.setup.issue(token);
    return {
      success: true,
      setupCode: setup.code,
      setupUrl: `${this.publicBaseUrl}/setup/${setup.code}`,
    };
  }
}
