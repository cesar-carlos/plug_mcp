import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { ContaRepositoryPort } from "../../domain/ports/conta-repository.port.js";
import type { PasswordHasherPort } from "../../domain/ports/crypto.port.js";
import type { McpAccount } from "../../domain/entities/conta.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class RegistrarConta {
  constructor(
    private readonly contas: ContaRepositoryPort,
    private readonly crypto: PasswordHasherPort,
  ) {}

  async execute(emailRaw: string, password: string): Promise<McpAccount> {
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "E-mail inválido.",
        hint: "Informe um e-mail válido para a conta MCP (não é o login do plug-server).",
      });
    }
    if (!password || password.length < 8) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Senha deve ter no mínimo 8 caracteres.",
        hint: "Escolha uma senha da conta neste MCP. Ela não acessa o ERP diretamente.",
      });
    }
    const existing = await this.contas.findByEmail(email);
    if (existing) {
      throw new DomainError({
        code: ERROR_CODES.ACCOUNT_EXISTS,
        message: "Já existe conta com este e-mail.",
        hint: "Use a tela de login em vez de criar outra conta.",
      });
    }
    const hash = await this.crypto.hashPassword(password);
    return this.contas.insert(email, hash);
  }
}

export class AutenticarConta {
  constructor(
    private readonly contas: ContaRepositoryPort,
    private readonly crypto: PasswordHasherPort,
  ) {}

  async execute(emailRaw: string, password: string): Promise<McpAccount> {
    const email = emailRaw.trim().toLowerCase();
    const account = await this.contas.findByEmail(email);
    const ok = account ? await this.crypto.verifyPassword(password, account.passwordHash) : false;
    if (!account || !ok) {
      throw new DomainError({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: "E-mail ou senha inválidos.",
        hint: "Use a conta MCP criada neste servidor. Se não tiver conta, registre-se em /oauth/signup.",
      });
    }
    return account;
  }
}
