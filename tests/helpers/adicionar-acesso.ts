import { AdicionarAcesso } from "../../src/application/use-cases/cofre.js";
import type { CryptoPort } from "../../src/domain/ports/crypto.port.js";
import type { LoggerPort } from "../../src/domain/ports/logger.port.js";
import type { AcessoRepositoryPort } from "../../src/domain/ports/acesso-repository.port.js";
import type { PlugServerGatewayPort } from "../../src/domain/ports/plug-server-gateway.port.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import { stubSessions } from "./stub-sessions.js";

export const newAdicionarAcesso = (
  acessos: AcessoRepositoryPort,
  plug: PlugServerGatewayPort,
  crypto: CryptoPort,
  sessions = stubSessions(),
  setup = new SetupCodeStore(),
  logger?: LoggerPort,
): AdicionarAcesso =>
  new AdicionarAcesso(acessos, plug, sessions, crypto, setup, "http://localhost", 0, logger);
