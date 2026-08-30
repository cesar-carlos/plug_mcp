import type {
  ColunaGrafo,
  EscopoValidacaoRel,
  GrafoDialeto,
  OrigemFato,
  RelacionamentoGrafo,
  SchemaSnapshotGrafo,
  TabelaGrafo,
} from "../entities/grafo.js";
import type { Cardinalidade, PapelColuna, PerfilColuna } from "../entities/escopo.js";
import type { ParRelacionamento } from "../entities/relacionamento.js";
import type { SensibilidadeColuna } from "../entities/privacidade.js";
import type { HitBusca } from "../entities/hit-busca.js";

export interface MergeTabelaInput {
  readonly agentId: string;
  readonly nome: string;
  readonly descricao?: string | null;
  readonly origem: OrigemFato;
  readonly autorUsuarioId: string | null;
}

export interface MergeColunaInput {
  readonly tabelaId: string;
  readonly nome: string;
  readonly tipo?: string | null;
  readonly nullable?: boolean | null;
  readonly descricao?: string | null;
  readonly dicionario?: string | null;
  readonly papel?: PapelColuna | null;
  readonly formato?: string | null;
  readonly perfil?: PerfilColuna | null;
  readonly sensibilidade?: SensibilidadeColuna | null;
  readonly origem: OrigemFato;
  readonly autorUsuarioId: string | null;
}

export interface MergeRelacionamentoInput {
  readonly agentId: string;
  readonly tabelaOrigemId: string;
  readonly colunaOrigem?: string;
  readonly tabelaDestinoId: string;
  readonly colunaDestino?: string;
  readonly pares?: readonly ParRelacionamento[];
  readonly tipoJoin: string;
  readonly cardinalidade?: Cardinalidade | null;
  readonly descricao?: string | null;
  readonly escopoValidacao?: EscopoValidacaoRel | null;
  readonly origem: OrigemFato;
  readonly autorUsuarioId: string | null;
}

export interface ConflitoGrafo {
  readonly kind: "tabela" | "coluna" | "join";
  readonly tabelaId?: string;
  readonly colunaId?: string;
  readonly relacionamentoId?: string;
  readonly tabela?: string;
  readonly coluna?: string;
  readonly join?: string;
  readonly hint: string;
}

export interface GrafoRepositoryPort {
  withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T>;
  getDialeto(agentId: string): Promise<GrafoDialeto | null>;
  setDialeto(agentId: string, dialeto: string): Promise<void>;
  mergeTabela(input: MergeTabelaInput): Promise<{ tabela: TabelaGrafo; conflito: boolean }>;
  mergeColuna(input: MergeColunaInput): Promise<{ coluna: ColunaGrafo; conflito: boolean }>;
  mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }>;
  deleteRelacionamento(id: string): Promise<boolean>;
  listTabelas(agentId: string): Promise<readonly TabelaGrafo[]>;
  listColunas(tabelaId: string): Promise<readonly ColunaGrafo[]>;
  listRelacionamentos(agentId: string): Promise<readonly RelacionamentoGrafo[]>;
  countConflitos(agentId: string): Promise<number>;
  listConflitos(agentId: string): Promise<readonly ConflitoGrafo[]>;
  findTabelaByNome(agentId: string, nome: string): Promise<TabelaGrafo | null>;
  findColuna(tabelaId: string, nome: string): Promise<ColunaGrafo | null>;
  saveSchemaSnapshot(input: {
    agentId: string;
    tabelaNome: string;
    assinatura: string;
  }): Promise<{ drifted: boolean; anterior: string | null }>;
  listSchemaSnapshots(agentId: string): Promise<readonly SchemaSnapshotGrafo[]>;
  resolverConflito(input: {
    tabelaId?: string;
    colunaId?: string;
    relacionamentoId?: string;
    origem: OrigemFato;
    descricao?: string | null;
    dicionario?: string | null;
    autorUsuarioId: string | null;
  }): Promise<void>;
  buscar(agentId: string, query: string, limite: number): Promise<readonly HitBusca<TabelaGrafo>[]>;
}
