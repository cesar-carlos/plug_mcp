import type {
  ColunaGrafo,
  GrafoDialeto,
  OrigemFato,
  RelacionamentoGrafo,
  TabelaGrafo,
} from "../entities/grafo.js";

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
  readonly descricao?: string | null;
  readonly dicionario?: string | null;
  readonly origem: OrigemFato;
  readonly autorUsuarioId: string | null;
}

export interface MergeRelacionamentoInput {
  readonly agentId: string;
  readonly tabelaOrigemId: string;
  readonly colunaOrigem: string;
  readonly tabelaDestinoId: string;
  readonly colunaDestino: string;
  readonly tipoJoin: string;
  readonly descricao?: string | null;
  readonly origem: OrigemFato;
  readonly autorUsuarioId: string | null;
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
  listTabelas(agentId: string): Promise<readonly TabelaGrafo[]>;
  listColunas(tabelaId: string): Promise<readonly ColunaGrafo[]>;
  listRelacionamentos(agentId: string): Promise<readonly RelacionamentoGrafo[]>;
  findTabelaByNome(agentId: string, nome: string): Promise<TabelaGrafo | null>;
  findColuna(tabelaId: string, nome: string): Promise<ColunaGrafo | null>;
  resolverConflito(input: {
    tabelaId?: string;
    colunaId?: string;
    relacionamentoId?: string;
    origem: OrigemFato;
    descricao?: string | null;
    dicionario?: string | null;
    autorUsuarioId: string | null;
  }): Promise<void>;
  buscar(agentId: string, query: string, limite: number): Promise<readonly TabelaGrafo[]>;
}
