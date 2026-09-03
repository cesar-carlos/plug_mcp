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
  readonly acessoId: string;
  readonly nome: string;
  readonly descricao?: string | null;
  readonly origem: OrigemFato;
  readonly autorUsuarioId: string | null;
}

export interface MergeColunaInput {
  readonly acessoId: string;
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
  readonly acessoId: string;
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
  withAcessoLock<T>(acessoId: string, fn: () => Promise<T>): Promise<T>;
  getDialeto(acessoId: string): Promise<GrafoDialeto | null>;
  setDialeto(acessoId: string, dialeto: string): Promise<void>;
  deleteByAcesso(acessoId: string): Promise<void>;
  mergeTabela(input: MergeTabelaInput): Promise<{ tabela: TabelaGrafo; conflito: boolean }>;
  mergeColuna(input: MergeColunaInput): Promise<{ coluna: ColunaGrafo; conflito: boolean }>;
  mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }>;
  deleteRelacionamento(acessoId: string, id: string): Promise<boolean>;
  listTabelas(acessoId: string): Promise<readonly TabelaGrafo[]>;
  listColunas(acessoId: string, tabelaId: string): Promise<readonly ColunaGrafo[]>;
  listRelacionamentos(acessoId: string): Promise<readonly RelacionamentoGrafo[]>;
  countConflitos(acessoId: string): Promise<number>;
  listConflitos(acessoId: string): Promise<readonly ConflitoGrafo[]>;
  findTabelaByNome(acessoId: string, nome: string): Promise<TabelaGrafo | null>;
  findColuna(acessoId: string, tabelaId: string, nome: string): Promise<ColunaGrafo | null>;
  saveSchemaSnapshot(input: {
    acessoId: string;
    tabelaNome: string;
    assinatura: string;
  }): Promise<{ drifted: boolean; anterior: string | null }>;
  listSchemaSnapshots(acessoId: string): Promise<readonly SchemaSnapshotGrafo[]>;
  resolverConflito(input: {
    acessoId: string;
    tabelaId?: string;
    colunaId?: string;
    relacionamentoId?: string;
    origem: OrigemFato;
    descricao?: string | null;
    dicionario?: string | null;
    autorUsuarioId: string | null;
  }): Promise<void>;
  buscar(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<TabelaGrafo>[]>;
}
