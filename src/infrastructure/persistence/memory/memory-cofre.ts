import { randomUUID } from "node:crypto";
import type { Acesso, NovoAcesso, StatusAcesso } from "../../../domain/entities/acesso.js";
import type { NovoUsuarioMcp, UsuarioMcp } from "../../../domain/entities/usuario-mcp.js";
import type {
  AnotacaoGrafo,
  NovaSkill,
  Skill,
  StatusSkill,
  ParametroSkill,
} from "../../../domain/entities/skill.js";
import { parseParametroSkillList } from "../../../domain/entities/skill.js";
import type {
  ConsultaAprendida,
  LacunaConsulta,
  Sinonimo,
  StatusLacuna,
  TipoLacuna,
} from "../../../domain/entities/aprendizado.js";
import { chavePerguntaLacuna } from "../../../domain/entities/aprendizado.js";
import type { AprendizadoRepositoryPort } from "../../../domain/ports/aprendizado-repository.port.js";
import type { HitBusca } from "../../../domain/entities/hit-busca.js";
import { escopoVazio } from "../../../domain/entities/escopo.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
  paresDeInput,
} from "../../../domain/entities/relacionamento.js";
import { parseSensibilidadeColuna } from "../../../domain/entities/privacidade.js";
import type {
  ColunaGrafo,
  GrafoDialeto,
  OrigemFato,
  RelacionamentoGrafo,
  SchemaSnapshotGrafo,
  TabelaGrafo,
} from "../../../domain/entities/grafo.js";
import { decidirMerge, mergeCamposColuna } from "../../../domain/entities/merge-fato.js";
import type { AcessoRepositoryPort } from "../../../domain/ports/acesso-repository.port.js";
import type { UsuarioRepositoryPort } from "../../../domain/ports/usuario-repository.port.js";
import type {
  GrafoRepositoryPort,
  MergeColunaInput,
  MergeRelacionamentoInput,
  MergeTabelaInput,
  ConflitoGrafo,
} from "../../../domain/ports/grafo-repository.port.js";
import { montarListaConflitos } from "../montar-conflitos.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../../domain/ports/skill-repository.port.js";
import type { AuditLogPort } from "../../../domain/ports/audit-log.port.js";
import { rankByTermsHits, tokenizeQuery } from "../busca-termos.js";
import type { AuditLogEntry, NewAuditLog } from "../../../domain/entities/audit-log.js";
import { mesmoAcessoCatalogo } from "../as-acesso-id.js";

const now = (): Date => new Date();
const id = (): string => randomUUID();
const lower = (value: string): string => value.trim().toLowerCase();

const colunaNaoPersistida = (input: MergeColunaInput): ColunaGrafo => ({
  id: input.tabelaId,
  tabelaId: input.tabelaId,
  nome: input.nome,
  tipo: input.tipo ?? null,
  nullable: input.nullable ?? null,
  descricao: input.descricao ?? null,
  dicionario: input.dicionario ?? null,
  papel: input.papel ?? null,
  formato: input.formato ?? null,
  perfil: input.perfil ?? null,
  sensibilidade: parseSensibilidadeColuna(input.sensibilidade ?? "livre"),
  origem: input.origem,
  status: "vigente",
  autorUsuarioId: input.autorUsuarioId,
});

export class InMemoryUsuarioRepository implements UsuarioRepositoryPort {
  private readonly rows = new Map<string, UsuarioMcp>();

  async create(input: NovoUsuarioMcp): Promise<UsuarioMcp> {
    const row: UsuarioMcp = { id: id(), ...input, createdAt: now(), updatedAt: now() };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(usuarioId: string): Promise<UsuarioMcp | null> {
    return this.rows.get(usuarioId) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<UsuarioMcp | null> {
    return [...this.rows.values()].find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async findByEmailHash(emailHash: string): Promise<UsuarioMcp | null> {
    return [...this.rows.values()].find((row) => row.emailHash === emailHash) ?? null;
  }

  async updateTokenHash(
    usuarioId: string,
    tokenHash: string,
    tokenExpiresAt?: Date | null,
  ): Promise<void> {
    const row = this.rows.get(usuarioId);
    if (!row) {
      return;
    }
    this.rows.set(usuarioId, {
      ...row,
      tokenHash,
      ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
      updatedAt: now(),
    });
  }

  async updateCredenciais(usuarioId: string, emailEnc: string, senhaEnc: string): Promise<void> {
    const row = this.rows.get(usuarioId);
    if (!row) {
      return;
    }
    this.rows.set(usuarioId, { ...row, emailEnc, senhaEnc, updatedAt: now() });
  }

  async deleteById(usuarioId: string): Promise<void> {
    this.rows.delete(usuarioId);
  }
}

export class InMemoryAcessoRepository implements AcessoRepositoryPort {
  private readonly rows = new Map<string, Acesso>();

  async create(input: NovoAcesso): Promise<Acesso> {
    const row: Acesso = {
      id: id(),
      ...input,
      escopoPadrao: input.escopoPadrao ?? null,
      timezone: input.timezone ?? null,
      nomePersona: input.nomePersona ?? null,
      instrucoesPersona: input.instrucoesPersona ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(acessoId: string): Promise<Acesso | null> {
    return this.rows.get(acessoId) ?? null;
  }

  async findByIdForUsuario(acessoId: string, usuarioId: string): Promise<Acesso | null> {
    const row = this.rows.get(acessoId);
    return row?.usuarioId === usuarioId ? row : null;
  }

  async listByUsuario(usuarioId: string): Promise<readonly Acesso[]> {
    return [...this.rows.values()].filter((row) => row.usuarioId === usuarioId);
  }

  async findByUsuarioAgentTokenHash(
    usuarioId: string,
    agentId: string,
    clientTokenHash: string,
  ): Promise<Acesso | null> {
    return (
      [...this.rows.values()].find(
        (row) =>
          row.usuarioId === usuarioId &&
          row.agentId === agentId &&
          row.clientTokenHash === clientTokenHash,
      ) ?? null
    );
  }

  async updateStatus(acessoId: string, status: StatusAcesso): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, statusAcesso: status, updatedAt: now() });
  }

  async updateClientToken(
    acessoId: string,
    clientTokenEnc: string,
    clientTokenHash: string,
  ): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, clientTokenEnc, clientTokenHash, updatedAt: now() });
  }

  async updateDialeto(acessoId: string, dialeto: Acesso["dialeto"]): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, dialeto, updatedAt: now() });
  }

  async updateEscopoPadrao(
    acessoId: string,
    escopoPadrao: Acesso["escopoPadrao"],
    timezone: string | null,
  ): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, escopoPadrao, timezone, updatedAt: now() });
  }

  async updatePersona(
    acessoId: string,
    nomePersona: string | null,
    instrucoesPersona: string | null,
  ): Promise<void> {
    const row = this.rows.get(acessoId);
    if (!row) {
      return;
    }
    this.rows.set(acessoId, { ...row, nomePersona, instrucoesPersona, updatedAt: now() });
  }

  async deleteById(acessoId: string): Promise<void> {
    this.rows.delete(acessoId);
  }
}

export class InMemoryGrafoRepository implements GrafoRepositoryPort {
  private readonly dialetos = new Map<string, GrafoDialeto>();
  private readonly tabelas = new Map<string, TabelaGrafo>();
  private readonly colunas = new Map<string, ColunaGrafo>();
  private readonly rels = new Map<string, RelacionamentoGrafo>();
  private readonly snapshots = new Map<string, SchemaSnapshotGrafo>();
  private readonly locks = new Map<string, Promise<void>>();

  async withAcessoLock<T>(acessoId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(acessoId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      acessoId,
      previous.then(() => current),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async getDialeto(acessoId: string): Promise<GrafoDialeto | null> {
    return this.dialetos.get(acessoId) ?? null;
  }

  async setDialeto(acessoId: string, dialeto: string): Promise<void> {
    this.dialetos.set(acessoId, { acessoId, dialeto });
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    const tabelaIds = new Set(
      [...this.tabelas.values()]
        .filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId))
        .map((row) => row.id),
    );
    for (const tabelaId of tabelaIds) {
      this.tabelas.delete(tabelaId);
    }
    for (const [colunaId, coluna] of this.colunas) {
      if (tabelaIds.has(coluna.tabelaId)) {
        this.colunas.delete(colunaId);
      }
    }
    for (const [relId, rel] of this.rels) {
      if (mesmoAcessoCatalogo(rel.acessoId, acessoId)) {
        this.rels.delete(relId);
      }
    }
    for (const [key, snap] of this.snapshots) {
      if (mesmoAcessoCatalogo(snap.acessoId, acessoId)) {
        this.snapshots.delete(key);
      }
    }
    this.dialetos.delete(acessoId);
    this.locks.delete(acessoId);
  }

  private tabelaDoAcesso(acessoId: string, tabelaId: string): TabelaGrafo | undefined {
    const tabela = this.tabelas.get(tabelaId);
    return tabela && mesmoAcessoCatalogo(tabela.acessoId, acessoId) ? tabela : undefined;
  }

  async mergeTabela(input: MergeTabelaInput): Promise<{ tabela: TabelaGrafo; conflito: boolean }> {
    const existing = [...this.tabelas.values()].find(
      (row) =>
        mesmoAcessoCatalogo(row.acessoId, input.acessoId) && lower(row.nome) === lower(input.nome),
    );
    if (!existing) {
      const tabela: TabelaGrafo = {
        id: id(),
        acessoId: input.acessoId,
        nome: input.nome,
        descricao: input.descricao ?? null,
        origem: input.origem,
        status: "vigente",
        autorUsuarioId: input.autorUsuarioId,
      };
      this.tabelas.set(tabela.id, tabela);
      return { tabela, conflito: false };
    }
    const merge = decidirMerge(
      {
        origem: existing.origem,
        status: existing.status,
        descricao: existing.descricao,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
      },
    );
    if (!merge.aplicar) {
      return { tabela: existing, conflito: false };
    }
    const tabela: TabelaGrafo = {
      ...existing,
      descricao: merge.descricao,
      origem: merge.origem,
      status: merge.status,
      autorUsuarioId: input.autorUsuarioId,
    };
    this.tabelas.set(tabela.id, tabela);
    return { tabela, conflito: merge.conflito };
  }

  async mergeColuna(input: MergeColunaInput): Promise<{ coluna: ColunaGrafo; conflito: boolean }> {
    if (!this.tabelaDoAcesso(input.acessoId, input.tabelaId)) {
      return { coluna: colunaNaoPersistida(input), conflito: false };
    }
    const existing = [...this.colunas.values()].find(
      (row) => row.tabelaId === input.tabelaId && lower(row.nome) === lower(input.nome),
    );
    if (!existing) {
      const coluna: ColunaGrafo = {
        id: id(),
        tabelaId: input.tabelaId,
        nome: input.nome,
        tipo: input.tipo ?? null,
        nullable: input.nullable ?? null,
        descricao: input.descricao ?? null,
        dicionario: input.dicionario ?? null,
        papel: input.papel ?? null,
        formato: input.formato ?? null,
        perfil: input.perfil ?? null,
        sensibilidade: parseSensibilidadeColuna(input.sensibilidade ?? "livre"),
        origem: input.origem,
        status: "vigente",
        autorUsuarioId: input.autorUsuarioId,
      };
      this.colunas.set(coluna.id, coluna);
      return { coluna, conflito: false };
    }
    const merged = mergeCamposColuna(existing, input);
    if (!merged) {
      return { coluna: existing, conflito: false };
    }
    const coluna: ColunaGrafo = {
      ...existing,
      ...merged.campos,
      autorUsuarioId: input.autorUsuarioId,
    };
    this.colunas.set(coluna.id, coluna);
    return { coluna, conflito: merged.conflito };
  }

  async mergeRelacionamento(
    input: MergeRelacionamentoInput,
  ): Promise<{ relacionamento: RelacionamentoGrafo; conflito: boolean }> {
    const pares = paresDeInput(input);
    if (pares.length === 0) {
      throw new Error("relacionamento exige ao menos um par de colunas");
    }
    const origemOk = this.tabelaDoAcesso(input.acessoId, input.tabelaOrigemId);
    const destinoOk = this.tabelaDoAcesso(input.acessoId, input.tabelaDestinoId);
    if (!origemOk || !destinoOk) {
      const first = pares[0]!;
      return {
        relacionamento: {
          id: input.tabelaOrigemId,
          acessoId: input.acessoId,
          tabelaOrigemId: input.tabelaOrigemId,
          colunaOrigem: first.colunaOrigem,
          tabelaDestinoId: input.tabelaDestinoId,
          colunaDestino: first.colunaDestino,
          pares,
          paresFingerprint: fingerprintPares(pares),
          tipoJoin: input.tipoJoin,
          cardinalidade: input.cardinalidade ?? null,
          descricao: input.descricao ?? null,
          escopoValidacao: input.escopoValidacao ?? null,
          origem: input.origem,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        },
        conflito: false,
      };
    }
    const fp = fingerprintPares(pares);
    const fpInv = fingerprintParesInvertidos(pares);
    const existing = [...this.rels.values()].find((row) => {
      if (!mesmoAcessoCatalogo(row.acessoId, input.acessoId)) {
        return false;
      }
      const direto =
        row.tabelaOrigemId === input.tabelaOrigemId &&
        row.tabelaDestinoId === input.tabelaDestinoId &&
        row.paresFingerprint === fp;
      const inverso =
        row.tabelaOrigemId === input.tabelaDestinoId &&
        row.tabelaDestinoId === input.tabelaOrigemId &&
        row.paresFingerprint === fpInv;
      return direto || inverso;
    });
    const first = pares[0]!;
    if (!existing) {
      const relacionamento: RelacionamentoGrafo = {
        id: id(),
        acessoId: input.acessoId,
        tabelaOrigemId: input.tabelaOrigemId,
        colunaOrigem: first.colunaOrigem,
        tabelaDestinoId: input.tabelaDestinoId,
        colunaDestino: first.colunaDestino,
        pares,
        paresFingerprint: fp,
        tipoJoin: input.tipoJoin,
        cardinalidade: input.cardinalidade ?? null,
        descricao: input.descricao ?? null,
        escopoValidacao: input.escopoValidacao ?? null,
        origem: input.origem,
        status: "vigente",
        autorUsuarioId: input.autorUsuarioId,
      };
      this.rels.set(relacionamento.id, relacionamento);
      return { relacionamento, conflito: false };
    }
    const merge = decidirMerge(
      {
        origem: existing.origem,
        status: existing.status,
        descricao: existing.descricao,
        tipoJoin: existing.tipoJoin,
      },
      {
        origem: input.origem,
        status: "vigente",
        descricao: input.descricao ?? null,
        tipoJoin: input.tipoJoin,
      },
    );
    if (!merge.aplicar && input.cardinalidade == null && input.escopoValidacao == null) {
      return { relacionamento: existing, conflito: false };
    }
    const relacionamento: RelacionamentoGrafo = {
      ...existing,
      tipoJoin: merge.tipoJoin ?? existing.tipoJoin,
      cardinalidade: input.cardinalidade ?? existing.cardinalidade,
      descricao: merge.descricao,
      escopoValidacao: input.escopoValidacao ?? existing.escopoValidacao,
      origem: merge.origem,
      status: merge.status,
      autorUsuarioId: input.autorUsuarioId,
    };
    this.rels.set(relacionamento.id, relacionamento);
    return { relacionamento, conflito: merge.conflito };
  }

  async deleteRelacionamento(acessoId: string, id: string): Promise<boolean> {
    const row = this.rels.get(id);
    if (!row || !mesmoAcessoCatalogo(row.acessoId, acessoId)) {
      return false;
    }
    return this.rels.delete(id);
  }

  async listTabelas(acessoId: string): Promise<readonly TabelaGrafo[]> {
    return [...this.tabelas.values()].filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId));
  }

  async listColunas(acessoId: string, tabelaId: string): Promise<readonly ColunaGrafo[]> {
    if (!this.tabelaDoAcesso(acessoId, tabelaId)) {
      return [];
    }
    return [...this.colunas.values()].filter((row) => row.tabelaId === tabelaId);
  }

  async listRelacionamentos(acessoId: string): Promise<readonly RelacionamentoGrafo[]> {
    return [...this.rels.values()].filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId));
  }

  async countConflitos(acessoId: string): Promise<number> {
    const tabelas = [...this.tabelas.values()].filter((row) =>
      mesmoAcessoCatalogo(row.acessoId, acessoId),
    );
    let n = tabelas.filter((tabela) => tabela.status === "conflito").length;
    const tabelaIds = new Set(tabelas.map((tabela) => tabela.id));
    n += [...this.colunas.values()].filter(
      (coluna) => tabelaIds.has(coluna.tabelaId) && coluna.status === "conflito",
    ).length;
    n += [...this.rels.values()].filter(
      (rel) => mesmoAcessoCatalogo(rel.acessoId, acessoId) && rel.status === "conflito",
    ).length;
    return n;
  }

  async listConflitos(acessoId: string): Promise<readonly ConflitoGrafo[]> {
    const tabelas = [...this.tabelas.values()].filter((row) =>
      mesmoAcessoCatalogo(row.acessoId, acessoId),
    );
    const tabelaIds = new Set(tabelas.map((tabela) => tabela.id));
    const colunas = [...this.colunas.values()].filter((coluna) => tabelaIds.has(coluna.tabelaId));
    const rels = [...this.rels.values()].filter((rel) =>
      mesmoAcessoCatalogo(rel.acessoId, acessoId),
    );
    return montarListaConflitos(tabelas, colunas, rels);
  }

  async findTabelaByNome(acessoId: string, nome: string): Promise<TabelaGrafo | null> {
    return (
      [...this.tabelas.values()].find(
        (row) => mesmoAcessoCatalogo(row.acessoId, acessoId) && lower(row.nome) === lower(nome),
      ) ?? null
    );
  }

  async findColuna(acessoId: string, tabelaId: string, nome: string): Promise<ColunaGrafo | null> {
    if (!this.tabelaDoAcesso(acessoId, tabelaId)) {
      return null;
    }
    return (
      [...this.colunas.values()].find(
        (row) => row.tabelaId === tabelaId && lower(row.nome) === lower(nome),
      ) ?? null
    );
  }

  async saveSchemaSnapshot(input: {
    acessoId: string;
    tabelaNome: string;
    assinatura: string;
  }): Promise<{ drifted: boolean; anterior: string | null }> {
    const key = `${input.acessoId}:${input.tabelaNome.toLowerCase()}`;
    const existing = this.snapshots.get(key);
    const anterior = existing?.assinatura ?? null;
    const drifted = anterior !== null && anterior !== input.assinatura;
    this.snapshots.set(key, {
      acessoId: input.acessoId,
      tabelaNome: input.tabelaNome,
      assinatura: input.assinatura,
    });
    return { drifted, anterior };
  }

  async listSchemaSnapshots(acessoId: string): Promise<readonly SchemaSnapshotGrafo[]> {
    return [...this.snapshots.values()].filter((row) =>
      mesmoAcessoCatalogo(row.acessoId, acessoId),
    );
  }

  async resolverConflito(input: {
    acessoId: string;
    tabelaId?: string;
    colunaId?: string;
    relacionamentoId?: string;
    origem: OrigemFato;
    descricao?: string | null;
    dicionario?: string | null;
    autorUsuarioId: string | null;
  }): Promise<void> {
    if (input.tabelaId) {
      const row = this.tabelas.get(input.tabelaId);
      if (row && mesmoAcessoCatalogo(row.acessoId, input.acessoId)) {
        this.tabelas.set(input.tabelaId, {
          ...row,
          origem: input.origem,
          descricao: input.descricao ?? row.descricao,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
    if (input.colunaId) {
      const row = this.colunas.get(input.colunaId);
      const tabela = row ? this.tabelas.get(row.tabelaId) : undefined;
      if (row && tabela && mesmoAcessoCatalogo(tabela.acessoId, input.acessoId)) {
        this.colunas.set(input.colunaId, {
          ...row,
          origem: input.origem,
          descricao: input.descricao ?? row.descricao,
          dicionario: input.dicionario ?? row.dicionario,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
    if (input.relacionamentoId) {
      const row = this.rels.get(input.relacionamentoId);
      if (row && mesmoAcessoCatalogo(row.acessoId, input.acessoId)) {
        this.rels.set(input.relacionamentoId, {
          ...row,
          origem: input.origem,
          descricao: input.descricao ?? row.descricao,
          status: "vigente",
          autorUsuarioId: input.autorUsuarioId,
        });
      }
    }
  }

  async buscar(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<TabelaGrafo>[]> {
    return rankByTermsHits(
      [...this.tabelas.values()].filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId)),
      tokenizeQuery(query),
      (row) => `${row.nome} ${row.descricao ?? ""}`,
      limite,
    );
  }
}

export class InMemorySkillRepository implements SkillRepositoryPort {
  private readonly rows = new Map<string, Skill>();

  async create(input: NovaSkill): Promise<Skill> {
    const row: Skill = {
      id: id(),
      acessoId: input.acessoId,
      slug: input.slug,
      nome: input.nome,
      descricao: input.descricao,
      sqlModelo: input.sqlModelo,
      params: parseParametroSkillList(input.params ?? []),
      escopo: input.escopo ?? escopoVazio(),
      autorUsuarioId: input.autorUsuarioId,
      versao: 1,
      pacoteVersao: input.pacoteVersao ?? input.escopo?.pacoteVersao ?? 1,
      status: "rascunho",
      motivoRevalidacao: input.motivoRevalidacao ?? null,
      consultaSemantica: input.consultaSemantica ?? null,
      politicaConsulta: input.politicaConsulta ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(
    skillId: string,
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
  ): Promise<Skill> {
    const row = this.rows.get(skillId);
    if (!row) {
      throw new Error("skill not found");
    }
    const next: Skill = {
      ...row,
      ...patch,
      versao: row.versao + 1,
      updatedAt: now(),
    };
    this.rows.set(skillId, next);
    return next;
  }

  async setStatus(skillId: string, status: StatusSkill, versao?: number): Promise<Skill> {
    const row = this.rows.get(skillId);
    if (!row) {
      throw new Error("skill not found");
    }
    const next: Skill = { ...row, status, versao: versao ?? row.versao, updatedAt: now() };
    this.rows.set(skillId, next);
    return next;
  }

  async findById(skillId: string): Promise<Skill | null> {
    return this.rows.get(skillId) ?? null;
  }

  async findBySlug(acessoId: string, slug: string): Promise<Skill | null> {
    return (
      [...this.rows.values()].find(
        (row) => mesmoAcessoCatalogo(row.acessoId, acessoId) && row.slug === slug,
      ) ?? null
    );
  }

  async listByAcesso(acessoId: string): Promise<readonly Skill[]> {
    return [...this.rows.values()].filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId));
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    for (const [id, row] of this.rows) {
      if (mesmoAcessoCatalogo(row.acessoId, acessoId)) {
        this.rows.delete(id);
      }
    }
  }

  async deleteById(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  async buscar(
    acessoId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly HitBusca<Skill>[]> {
    const allowed =
      status === undefined ? null : new Set(typeof status === "string" ? [status] : status);
    return rankByTermsHits(
      [...this.rows.values()].filter(
        (row) =>
          mesmoAcessoCatalogo(row.acessoId, acessoId) &&
          (allowed === null || allowed.has(row.status)),
      ),
      tokenizeQuery(query),
      (row) =>
        `${row.nome} ${row.descricao} ${row.slug} ${row.params
          .map((param) => `${param.nome} ${param.descricao}`)
          .join(" ")} ${row.escopo.metricasSaida
          .map((item) => `${item.alias} ${item.definicao ?? ""} ${item.grao ?? ""}`)
          .join(" ")}`,
      limite,
    );
  }
}

export class InMemoryAnotacaoGrafoRepository implements AnotacaoGrafoRepositoryPort {
  private readonly rows = new Map<string, AnotacaoGrafo>();

  async create(input: {
    acessoId: string;
    tabelaId: string | null;
    skillId?: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
  }): Promise<AnotacaoGrafo> {
    const row: AnotacaoGrafo = {
      id: id(),
      acessoId: input.acessoId,
      tabelaId: input.tabelaId,
      skillId: input.skillId ?? null,
      tipo: input.tipo,
      titulo: input.titulo,
      texto: input.texto,
      autorUsuarioId: input.autorUsuarioId,
      createdAt: now(),
      updatedAt: now(),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async list(
    acessoId: string,
    tabelaId?: string | null,
    skillId?: string | null,
  ): Promise<readonly AnotacaoGrafo[]> {
    return [...this.rows.values()].filter(
      (row) =>
        mesmoAcessoCatalogo(row.acessoId, acessoId) &&
        (tabelaId === undefined || row.tabelaId === tabelaId) &&
        (skillId === undefined || row.skillId === skillId),
    );
  }

  async findById(anotacaoId: string): Promise<AnotacaoGrafo | null> {
    return this.rows.get(anotacaoId) ?? null;
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    for (const [id, row] of this.rows) {
      if (mesmoAcessoCatalogo(row.acessoId, acessoId)) {
        this.rows.delete(id);
      }
    }
  }

  async deleteById(anotacaoId: string): Promise<boolean> {
    return this.rows.delete(anotacaoId);
  }

  async buscar(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<AnotacaoGrafo>[]> {
    return rankByTermsHits(
      [...this.rows.values()].filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId)),
      tokenizeQuery(query),
      (row) => `${row.titulo} ${row.texto}`,
      limite,
    );
  }
}

export class InMemoryAuditLog implements AuditLogPort {
  readonly entries: AuditLogEntry[] = [];

  async append(entry: NewAuditLog): Promise<AuditLogEntry> {
    const row: AuditLogEntry = { id: id(), createdAt: now(), ...entry };
    this.entries.push(row);
    return row;
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const before = this.entries.length;
    const keep = this.entries.filter((row) => row.createdAt >= cutoff);
    this.entries.length = 0;
    this.entries.push(...keep);
    return before - keep.length;
  }

  async listByUsuario(usuarioId: string, limite: number): Promise<readonly AuditLogEntry[]> {
    return this.entries
      .filter((row) => row.usuarioId === usuarioId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limite);
  }

  async listByAcesso(acessoId: string, limite: number): Promise<readonly AuditLogEntry[]> {
    return this.entries
      .filter((row) => row.acessoId === acessoId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limite);
  }
}

export class InMemoryAprendizadoRepository implements AprendizadoRepositoryPort {
  private readonly consultas: ConsultaAprendida[] = [];
  private readonly sinonimos: Sinonimo[] = [];
  private readonly lacunas: LacunaConsulta[] = [];

  async salvarConsulta(input: {
    acessoId: string;
    skillIds: readonly string[];
    pergunta: string;
    sql: string;
    paramsContrato: readonly ParametroSkill[];
    autorUsuarioId: string | null;
  }): Promise<ConsultaAprendida> {
    const existing = this.consultas.find(
      (row) => mesmoAcessoCatalogo(row.acessoId, input.acessoId) && row.sql === input.sql,
    );
    const mergedIds = [...new Set([...(existing?.skillIds ?? []), ...input.skillIds])];
    if (existing) {
      const next: ConsultaAprendida = {
        ...existing,
        skillIds: mergedIds,
        execucoes: existing.execucoes + 1,
        ultimaExecucao: now(),
        pergunta:
          input.pergunta.trim().length > existing.pergunta.trim().length
            ? input.pergunta
            : existing.pergunta,
      };
      const idx = this.consultas.findIndex((row) => row.id === existing.id);
      this.consultas[idx] = next;
      return next;
    }
    const row: ConsultaAprendida = {
      id: id(),
      acessoId: input.acessoId,
      skillIds: [...input.skillIds],
      pergunta: input.pergunta,
      sql: input.sql,
      paramsContrato: input.paramsContrato,
      execucoes: 1,
      ultimaExecucao: now(),
      status: "ativa",
      autorUsuarioId: input.autorUsuarioId,
    };
    this.consultas.push(row);
    return row;
  }

  async listarConsultas(acessoId: string, limite: number): Promise<readonly ConsultaAprendida[]> {
    return this.consultas
      .filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId))
      .sort((a, b) => b.execucoes - a.execucoes)
      .slice(0, limite);
  }

  async listarConsultasDaSkill(
    acessoId: string,
    skillId: string,
    limite: number,
  ): Promise<readonly ConsultaAprendida[]> {
    return this.consultas
      .filter(
        (row) => mesmoAcessoCatalogo(row.acessoId, acessoId) && row.skillIds.includes(skillId),
      )
      .sort((a, b) => b.execucoes - a.execucoes)
      .slice(0, limite);
  }

  async obterConsulta(acessoId: string, id: string): Promise<ConsultaAprendida | null> {
    return (
      this.consultas.find((row) => mesmoAcessoCatalogo(row.acessoId, acessoId) && row.id === id) ??
      null
    );
  }

  async buscarConsultas(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<ConsultaAprendida>[]> {
    const terms = tokenizeQuery(query);
    return rankByTermsHits(
      this.consultas.filter(
        (row) => mesmoAcessoCatalogo(row.acessoId, acessoId) && row.status === "ativa",
      ),
      terms,
      (row) => row.pergunta,
      limite,
    );
  }

  marcarStatusConsulta(id: string, status: string): void {
    const idx = this.consultas.findIndex((row) => row.id === id);
    const row = this.consultas[idx];
    if (idx < 0 || !row) {
      return;
    }
    this.consultas[idx] = { ...row, status };
  }

  async registrarSinonimo(input: {
    acessoId: string;
    termo: string;
    alvoTipo: string;
    alvoId: string;
  }): Promise<Sinonimo> {
    const row: Sinonimo = { id: id(), ...input };
    this.sinonimos.push(row);
    return row;
  }

  async listarSinonimos(acessoId: string): Promise<readonly Sinonimo[]> {
    return this.sinonimos.filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId));
  }

  async desvincularSkill(
    acessoId: string,
    skillId: string,
  ): Promise<{ consultas: number; sinonimos: number }> {
    let consultas = 0;
    for (let i = 0; i < this.consultas.length; i += 1) {
      const row = this.consultas[i];
      if (row && mesmoAcessoCatalogo(row.acessoId, acessoId) && row.skillIds.includes(skillId)) {
        this.consultas[i] = {
          ...row,
          skillIds: row.skillIds.filter((id) => id !== skillId),
        };
        consultas += 1;
      }
    }
    const before = this.sinonimos.length;
    const kept = this.sinonimos.filter(
      (row) =>
        !(
          mesmoAcessoCatalogo(row.acessoId, acessoId) &&
          row.alvoTipo === "skill" &&
          row.alvoId === skillId
        ),
    );
    this.sinonimos.length = 0;
    this.sinonimos.push(...kept);
    return { consultas, sinonimos: before - kept.length };
  }

  async registrarLacuna(
    acessoId: string,
    pergunta: string,
    tipo: TipoLacuna = "skill_gap",
    contrato: Record<string, unknown> | null = null,
  ): Promise<LacunaConsulta> {
    const perguntaChave = chavePerguntaLacuna(pergunta);
    const existing = this.lacunas.find(
      (row) =>
        mesmoAcessoCatalogo(row.acessoId, acessoId) &&
        row.tipo === tipo &&
        chavePerguntaLacuna(row.pergunta) === perguntaChave,
    );
    if (existing) {
      const next: LacunaConsulta = {
        ...existing,
        pergunta,
        contrato,
        status: "aberta",
      };
      const idx = this.lacunas.indexOf(existing);
      this.lacunas[idx] = next;
      return next;
    }
    const row: LacunaConsulta = {
      id: id(),
      acessoId,
      pergunta,
      tipo,
      status: "aberta",
      contrato,
      createdAt: now(),
    };
    this.lacunas.push(row);
    return row;
  }

  async arquivarLacunaSkillGap(acessoId: string, pergunta: string): Promise<number> {
    const perguntaChave = chavePerguntaLacuna(pergunta);
    if (!perguntaChave) {
      return 0;
    }
    let n = 0;
    for (let i = 0; i < this.lacunas.length; i += 1) {
      const row = this.lacunas[i];
      if (
        row &&
        mesmoAcessoCatalogo(row.acessoId, acessoId) &&
        row.tipo === "skill_gap" &&
        row.status === "aberta" &&
        chavePerguntaLacuna(row.pergunta) === perguntaChave
      ) {
        this.lacunas[i] = { ...row, status: "arquivada" };
        n += 1;
      }
    }
    return n;
  }

  async listarLacunas(
    acessoId: string,
    limite: number,
    status: StatusLacuna = "aberta",
  ): Promise<readonly LacunaConsulta[]> {
    return this.lacunas
      .filter((row) => mesmoAcessoCatalogo(row.acessoId, acessoId) && row.status === status)
      .slice(-limite)
      .reverse();
  }

  async deleteByAcesso(acessoId: string): Promise<void> {
    const keepConsultas = this.consultas.filter(
      (row) => !mesmoAcessoCatalogo(row.acessoId, acessoId),
    );
    this.consultas.length = 0;
    this.consultas.push(...keepConsultas);
    const keepSinonimos = this.sinonimos.filter(
      (row) => !mesmoAcessoCatalogo(row.acessoId, acessoId),
    );
    this.sinonimos.length = 0;
    this.sinonimos.push(...keepSinonimos);
    const keepLacunas = this.lacunas.filter((row) => !mesmoAcessoCatalogo(row.acessoId, acessoId));
    this.lacunas.length = 0;
    this.lacunas.push(...keepLacunas);
  }
}
