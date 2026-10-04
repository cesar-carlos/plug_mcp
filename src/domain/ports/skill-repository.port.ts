import type { HitBusca } from "../entities/hit-busca.js";
import type {
  AnotacaoGrafo,
  GovernancaConhecimento,
  NovaSkill,
  Skill,
  StatusConhecimento,
  StatusSkill,
} from "../entities/skill.js";

export interface SkillRepositoryPort {
  findPublicadaById(id: string): Promise<Skill | null>;
  listPublicadas(acessoId: string): Promise<readonly Skill[]>;
  buscarPublicadas(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<Skill>[]>;
  suspenderPublicacao(id: string): Promise<void>;
  ativarPublicacao?(
    id: string,
    publicacaoId: string,
    hash: string,
    pacote?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  create(input: NovaSkill): Promise<Skill>;
  update(
    id: string,
    patch: Partial<
      Pick<
        Skill,
        | "nome"
        | "descricao"
        | "sqlModelo"
        | "params"
        | "status"
        | "escopo"
        | "pacoteVersao"
        | "motivoRevalidacao"
        | "consultaSemantica"
        | "politicaConsulta"
        | "slug"
      >
    >,
  ): Promise<Skill>;
  setStatus(id: string, status: StatusSkill, versao?: number): Promise<Skill>;
  findById(id: string): Promise<Skill | null>;
  findBySlug(acessoId: string, slug: string): Promise<Skill | null>;
  listByAcesso(acessoId: string): Promise<readonly Skill[]>;
  deleteByAcesso(acessoId: string): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  buscar(
    acessoId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly HitBusca<Skill>[]>;
}

export interface AnotacaoGrafoRepositoryPort {
  create(input: {
    acessoId: string;
    tabelaId: string | null;
    skillId?: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
    governanca?: GovernancaConhecimento;
  }): Promise<AnotacaoGrafo>;
  update(
    id: string,
    patch: Partial<Pick<AnotacaoGrafo, "tipo" | "titulo" | "texto"> & GovernancaConhecimento>,
  ): Promise<AnotacaoGrafo>;
  list(
    acessoId: string,
    tabelaId?: string | null,
    skillId?: string | null,
    options?: { status?: StatusConhecimento; ativasEm?: Date },
  ): Promise<readonly AnotacaoGrafo[]>;
  findById(id: string): Promise<AnotacaoGrafo | null>;
  deleteByAcesso(acessoId: string): Promise<void>;
  deleteById(id: string): Promise<boolean>;
  buscar(
    acessoId: string,
    query: string,
    limite: number,
    options?: { ativasEm?: Date },
  ): Promise<readonly HitBusca<AnotacaoGrafo>[]>;
}
