import type { AuthorizedRepositories } from "../../../domain/ports/authorized-unit-of-work.port.js";
import {
  InMemoryUsuarioRepository,
  InMemoryAcessoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAprendizadoRepository,
  InMemoryAuditLog,
} from "./memory-cofre.js";
import { InMemorySkillPublicacaoRepository } from "./memory-skill-publicacao.js";
import { InMemoryOperacoesRepository } from "./memory-operacoes.js";
import { MemorySetupOperations } from "../setup-operation.js";
import { MemoryTreinamentoRepository } from "../treinamento.js";
export const createMemoryRepositories = (): AuthorizedRepositories => {
  const skills = new InMemorySkillRepository();
  return {
    usuarios: new InMemoryUsuarioRepository(),
    acessos: new InMemoryAcessoRepository(),
    grafo: new InMemoryGrafoRepository(),
    skills,
    anotacoes: new InMemoryAnotacaoGrafoRepository(),
    aprendizado: new InMemoryAprendizadoRepository(),
    audit: new InMemoryAuditLog(),
    publicacoes: new InMemorySkillPublicacaoRepository(skills),
    operacoes: new InMemoryOperacoesRepository(),
    setup: new MemorySetupOperations(),
    treinamento: new MemoryTreinamentoRepository(),
  };
};
