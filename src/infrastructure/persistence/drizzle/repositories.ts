import type { AuthorizedRepositories } from "../../../domain/ports/authorized-unit-of-work.port.js";
import type { Db } from "./db.js";
import {
  DrizzleUsuarioRepository,
  DrizzleAcessoRepository,
  DrizzleGrafoRepository,
  DrizzleSkillRepository,
  DrizzleAnotacaoGrafoRepository,
  DrizzleAuditLog,
  DrizzleAprendizadoRepository,
} from "./drizzle-cofre.js";
import { DrizzleSkillPublicacaoRepository } from "./drizzle-skill-publicacao.js";
import { DrizzleOperacoesRepository } from "./drizzle-operacoes.js";
import { DrizzleSetupOperations } from "../setup-operation.js";
import { DrizzleTreinamentoRepository } from "../treinamento.js";

export const createDrizzleRepositories = (db: Db): AuthorizedRepositories => ({
  usuarios: new DrizzleUsuarioRepository(db),
  acessos: new DrizzleAcessoRepository(db),
  grafo: new DrizzleGrafoRepository(db),
  skills: new DrizzleSkillRepository(db),
  anotacoes: new DrizzleAnotacaoGrafoRepository(db),
  audit: new DrizzleAuditLog(db),
  aprendizado: new DrizzleAprendizadoRepository(db),
  setup: new DrizzleSetupOperations(db),
  treinamento: new DrizzleTreinamentoRepository(db),
  publicacoes: new DrizzleSkillPublicacaoRepository(db),
  operacoes: new DrizzleOperacoesRepository(db),
});
