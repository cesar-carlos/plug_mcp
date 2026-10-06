import type { ConsumerAuth } from "../entities/consumer-auth.js";
import type { AcessoRepositoryPort } from "./acesso-repository.port.js";
import type { UsuarioRepositoryPort } from "./usuario-repository.port.js";
import type { GrafoRepositoryPort } from "./grafo-repository.port.js";
import type { SkillRepositoryPort, AnotacaoGrafoRepositoryPort } from "./skill-repository.port.js";
import type { AprendizadoRepositoryPort } from "./aprendizado-repository.port.js";
import type { SkillPublicacaoRepositoryPort } from "./skill-publicacao-repository.port.js";
import type { TreinamentoRepositoryPort } from "./treinamento-repository.port.js";
import type { SetupOperationRepositoryPort } from "./setup-operation.port.js";
import type { OperacoesRepositoryPort } from "./operacoes-repository.port.js";
import type { AuditLogPort } from "./audit-log.port.js";

/** Os adapters fornecem somente ports vinculados à mesma transação. */
export interface AuthorizedRepositories {
  acessos: AcessoRepositoryPort;
  usuarios: UsuarioRepositoryPort;
  grafo: GrafoRepositoryPort;
  skills: SkillRepositoryPort;
  anotacoes: AnotacaoGrafoRepositoryPort;
  aprendizado: AprendizadoRepositoryPort;
  publicacoes: SkillPublicacaoRepositoryPort;
  treinamento: TreinamentoRepositoryPort;
  setup: SetupOperationRepositoryPort;
  operacoes: OperacoesRepositoryPort;
  audit: AuditLogPort;
}
export interface AuthorizedUnitOfWorkPort {
  run<T>(
    auth: ConsumerAuth | undefined,
    operation: (repositories: AuthorizedRepositories) => Promise<T>,
    /** Acessos existentes alterados, declarados antes de adquirir locks. */
    accessIds?: readonly string[],
  ): Promise<T>;
}
