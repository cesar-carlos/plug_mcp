import type { FonteAnotacao, NovaAnotacaoInput } from "../../../domain/entities/anotacao.js";
import type {
  ConsultaMemoria,
  NovaConsultaMemoriaInput,
} from "../../../domain/entities/consulta-memoria.js";
import type { EscopoCatalogo } from "../../../domain/entities/fonte.js";
import type { AnotacaoRepositoryPort } from "../../../domain/ports/anotacao-repository.port.js";
import type { MemoriaConsultaRepositoryPort } from "../../../domain/ports/memoria-consulta-repository.port.js";
import type {
  HitContexto,
  IndiceContextoPort,
  ItemIndexavel,
} from "../../../domain/ports/indice-contexto.port.js";
import type { InMemoryCatalogoRepository } from "./memory-catalogo.js";
import { id, noEscopo, now, visivel } from "./memory-util.js";

export class InMemoryAnotacaoRepository implements AnotacaoRepositoryPort {
  readonly rows: FonteAnotacao[] = [];

  async listar(escopo: EscopoCatalogo, fonteId: string | null): Promise<readonly FonteAnotacao[]> {
    return this.rows
      .filter((row) => noEscopo(row, escopo) && row.fonteId === fonteId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async listarTudo(escopo: EscopoCatalogo, limite: number): Promise<readonly FonteAnotacao[]> {
    return this.rows
      .filter((row) => noEscopo(row, escopo))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limite);
  }

  async criar(input: NovaAnotacaoInput): Promise<FonteAnotacao> {
    const row: FonteAnotacao = {
      id: id(),
      mcpAccountId: input.escopo.mcpAccountId,
      agentId: input.escopo.agentId,
      fonteId: input.fonteId,
      tipo: input.tipo,
      titulo: input.titulo,
      texto: input.texto,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.push(row);
    return row;
  }

  async remover(anotacaoId: string, escopo: EscopoCatalogo): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === anotacaoId && noEscopo(row, escopo));
    if (index < 0) {
      return false;
    }
    this.rows.splice(index, 1);
    return true;
  }
}

export class InMemoryMemoriaConsultaRepository implements MemoriaConsultaRepositoryPort {
  readonly rows: ConsultaMemoria[] = [];

  async criar(input: NovaConsultaMemoriaInput): Promise<ConsultaMemoria> {
    const row: ConsultaMemoria = {
      id: id(),
      mcpAccountId: input.escopo.mcpAccountId,
      agentId: input.escopo.agentId,
      pergunta: input.pergunta,
      sqlExecutado: input.sqlExecutado,
      fonteSlug: input.fonteSlug,
      observacao: input.observacao,
      aprovadoEm: now(),
    };
    this.rows.push(row);
    return row;
  }

  async listar(escopo: EscopoCatalogo, limite: number): Promise<readonly ConsultaMemoria[]> {
    return this.rows
      .filter((row) => noEscopo(row, escopo))
      .sort((a, b) => b.aprovadoEm.getTime() - a.aprovadoEm.getTime())
      .slice(0, limite);
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const before = this.rows.length;
    this.rows.splice(0, this.rows.length, ...this.rows.filter((row) => row.aprovadoEm >= cutoff));
    return before - this.rows.length;
  }
}

const scoreTexto = (haystack: string, query: string): number => {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  if (terms.length === 0) {
    return 0;
  }
  const text = haystack.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (text.includes(term)) {
      hits += 1;
    }
  }
  return hits / terms.length;
};

export class InMemoryIndiceContexto implements IndiceContextoPort {
  constructor(
    private readonly catalogo: InMemoryCatalogoRepository,
    private readonly anotacoes: InMemoryAnotacaoRepository,
    private readonly memoria: InMemoryMemoriaConsultaRepository,
  ) {}

  async buscar(
    escopo: EscopoCatalogo,
    texto: string,
    limite: number,
  ): Promise<readonly HitContexto[]> {
    const query = texto.trim();
    if (query.length < 2) {
      return [];
    }
    const hits: HitContexto[] = [];
    for (const fonte of this.catalogo.fontes.filter((row) => row.ativo && visivel(row, escopo))) {
      const trecho = `${fonte.slug} ${fonte.nome} ${fonte.descricao}`;
      const score = scoreTexto(trecho, query);
      if (score > 0) {
        hits.push({
          tipo: "fonte",
          id: fonte.id,
          slug: fonte.slug,
          trecho: fonte.descricao,
          score,
        });
      }
    }
    for (const nota of this.anotacoes.rows.filter((row) => noEscopo(row, escopo))) {
      const score = scoreTexto(`${nota.titulo} ${nota.texto}`, query);
      if (score > 0) {
        hits.push({
          tipo: "anotacao",
          id: nota.id,
          slug: null,
          trecho: nota.texto.slice(0, 240),
          score,
        });
      }
    }
    for (const consulta of this.memoria.rows.filter((row) => noEscopo(row, escopo))) {
      const score = scoreTexto(`${consulta.pergunta} ${consulta.observacao}`, query);
      if (score > 0) {
        hits.push({
          tipo: "consulta",
          id: consulta.id,
          slug: consulta.fonteSlug,
          trecho: consulta.pergunta,
          score,
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limite);
  }

  indexar(_escopo: EscopoCatalogo, _item: ItemIndexavel): Promise<void> {
    return Promise.resolve();
  }
}
