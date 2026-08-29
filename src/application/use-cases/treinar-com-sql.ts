import type { Dialeto } from "../../domain/entities/dialeto.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { GrafoRepositoryPort } from "../../domain/ports/grafo-repository.port.js";
import type { SkillRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type {
  PlugServerGatewayPort,
  UsuarioPlugSessionPort,
} from "../../domain/ports/plug-server-gateway.port.js";
import { escopoFromSqlModelo } from "./shared/escopo-from-modelo.js";
import { paresDoRelacionamento } from "../../domain/entities/escopo.js";
import {
  parseSqlModelo,
  sqlAmostra,
  bindParamsForValidation,
  sqlParaOdbc,
} from "./shared/sql-modelo.js";
import { inferirPapelColuna } from "./shared/inferir-papel.js";
import {
  enriquecerPerfilCompleto,
  PERFIL_MAX_QUERIES,
  type AvisoPerfil,
} from "./shared/enriquecer-perfil.js";
import { registroOperacoesGlobal } from "./shared/progresso-operacao.js";
import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import { aplicarDerivaTabelaNoGrafo } from "./shared/schema-drift.js";
import { sincronizarEscopoComGrafo } from "./shared/sincronizar-escopo.js";
import { fluxoForAgentSkill, pickSkillInProgress } from "./shared/fluxo-treino.js";
import { requireAcesso, refreshAndRequireAcessoAprovado, requireUsuario } from "./shared/guards.js";
import { withHubAuth } from "./shared/hub-auth.js";

const allowedByPolicy = (
  table: string,
  policy: { allTables: boolean; tables: readonly string[] },
): boolean => {
  if (policy.allTables) {
    return true;
  }
  const wanted = table.toLowerCase();
  return policy.tables.some((item) => item.toLowerCase() === wanted);
};

export class TreinarComSql {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly grafo: GrafoRepositoryPort,
    private readonly plug: PlugServerGatewayPort,
    private readonly sessions: UsuarioPlugSessionPort,
    private readonly crypto: CryptoPort,
    private readonly audit: AuditLogPort,
    private readonly skills: SkillRepositoryPort,
    private readonly extras: { cache?: QueryResultCachePort; schemaDriftEnabled?: boolean } = {},
  ) {}

  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      sql?: string;
      params?: Record<string, unknown>;
      enriquecer?: "basico" | "completo";
    },
  ): Promise<{
    success: true;
    dialeto: Dialeto;
    tabelas: string[];
    colunas: string[];
    relacionamentos: number;
    conflitos: number;
    fluxoTreino: Awaited<ReturnType<typeof fluxoForAgentSkill>>;
    avisos: AvisoPerfil[];
    hint: string;
    progresso?: { operacaoId: string; fase: string; queriesUsadas: number; queriesLimite: number };
  }> {
    const started = Date.now();
    const uid = requireUsuario(usuarioId);
    const acesso = await refreshAndRequireAcessoAprovado(
      this.acessos,
      this.plug,
      this.sessions,
      await requireAcesso(this.acessos, input.acessoId, uid),
      uid,
    );
    const modelo = parseSqlModelo(input.sql ?? "");
    const escopo = escopoFromSqlModelo(modelo);
    const origem = "validado_execucao" as const;
    const params = bindParamsForValidation(modelo.sql, input.params);
    const clientToken = this.crypto.decrypt(acesso.clientTokenEnc);

    const policy = await withHubAuth(this.sessions, uid, (accessToken) =>
      this.plug.getClientTokenPolicy({
        accessToken,
        agentId: acesso.agentId,
        clientToken,
      }),
    );
    const denied = modelo.tabelas.filter((t) => !allowedByPolicy(t.nome, policy));
    if (denied.length > 0) {
      throw new DomainError({
        code: ERROR_CODES.PERMISSION_DENIED,
        message: "O client_token não cobre uma ou mais tabelas deste SQL.",
        hint: `Tabelas fora da policy: ${denied.map((t) => t.nome).join(", ")}. Peça um client_token que inclua essas tabelas ou treine só o que a policy cobre.`,
      });
    }

    try {
      await withHubAuth(this.sessions, uid, (accessToken) =>
        this.plug.executeSql({
          accessToken,
          agentId: acesso.agentId,
          clientToken,
          sql: sqlParaOdbc(sqlAmostra(acesso.dialeto, modelo.sql)),
          params,
          options: { maxRows: 1 },
        }),
      );
    } catch (error) {
      await this.audit.append({
        usuarioId: uid,
        acessoId: acesso.id,
        tool: "treinar_com_sql",
        sqlEnviado: modelo.sql,
        sucesso: false,
        codigoErro: error instanceof DomainError ? error.code : ERROR_CODES.PLUG_SERVER_ERROR,
        linhasRetornadas: null,
        duracaoMs: Date.now() - started,
      });
      throw error;
    }

    const merged = await this.grafo.withAgentLock(acesso.agentId, async () => {
      const locked = await this.grafo.getDialeto(acesso.agentId);
      if (!locked) {
        await this.grafo.setDialeto(acesso.agentId, acesso.dialeto);
      } else if (locked.dialeto !== acesso.dialeto) {
        throw new DomainError({
          code: ERROR_CODES.DIALECT_CONFLICT,
          message: "Este agentId já foi treinado em outro dialeto.",
          hint: `Grafo travado em ${locked.dialeto}. Chame atualizar_dialeto com confirmadoPeloUsuario: true para mudar o dialeto (skills voltam a rascunho).`,
        });
      }
      let conflitos = 0;
      const tabelaIds = new Map<string, string>();
      for (const tabela of modelo.tabelas) {
        const result = await this.grafo.mergeTabela({
          agentId: acesso.agentId,
          nome: tabela.nome,
          origem,
          autorUsuarioId: uid,
        });
        tabelaIds.set(tabela.nome.toLowerCase(), result.tabela.id);
        if (result.conflito) {
          conflitos += 1;
        }
      }
      for (const [tabelaNome, colunas] of Object.entries(escopo.colunasPorTabela)) {
        const tabelaId = tabelaIds.get(tabelaNome.toLowerCase());
        if (!tabelaId) {
          continue;
        }
        for (const colunaNome of colunas) {
          const result = await this.grafo.mergeColuna({
            tabelaId,
            nome: colunaNome,
            papel: inferirPapelColuna(colunaNome, null),
            origem,
            autorUsuarioId: uid,
          });
          if (result.conflito) {
            conflitos += 1;
          }
        }
      }
      let rels = 0;
      for (const rel of escopo.relacionamentos) {
        const origemId = tabelaIds.get(rel.tabelaOrigem.toLowerCase());
        const destinoId = tabelaIds.get(rel.tabelaDestino.toLowerCase());
        if (!origemId || !destinoId) {
          continue;
        }
        const pares = paresDoRelacionamento(rel);
        for (const par of pares) {
          const leftCol = await this.grafo.mergeColuna({
            tabelaId: origemId,
            nome: par.colunaOrigem,
            origem,
            autorUsuarioId: uid,
          });
          if (leftCol.conflito) {
            conflitos += 1;
          }
          const rightCol = await this.grafo.mergeColuna({
            tabelaId: destinoId,
            nome: par.colunaDestino,
            origem,
            autorUsuarioId: uid,
          });
          if (rightCol.conflito) {
            conflitos += 1;
          }
        }
        const first = pares[0];
        if (!first) {
          continue;
        }
        const result = await this.grafo.mergeRelacionamento({
          agentId: acesso.agentId,
          tabelaOrigemId: origemId,
          colunaOrigem: first.colunaOrigem,
          tabelaDestinoId: destinoId,
          colunaDestino: first.colunaDestino,
          pares,
          tipoJoin: rel.tipoJoin,
          origem,
          autorUsuarioId: uid,
        });
        rels += 1;
        if (result.conflito) {
          conflitos += 1;
        }
      }
      return { conflitos, rels };
    });

    const avisos: AvisoPerfil[] = [];
    let progresso:
      | { operacaoId: string; fase: string; queriesUsadas: number; queriesLimite: number }
      | undefined;
    if (input.enriquecer === "completo") {
      const op = registroOperacoesGlobal.iniciar(uid, "treinar_com_sql", PERFIL_MAX_QUERIES);
      try {
        const perfil = await enriquecerPerfilCompleto({
          grafo: this.grafo,
          executeSql: async (sql, params) =>
            withHubAuth(this.sessions, uid, (accessToken) =>
              this.plug.executeSql({
                accessToken,
                agentId: acesso.agentId,
                clientToken,
                sql: sqlParaOdbc(sql),
                params: params ?? {},
                options: { maxRows: 300 },
              }),
            ),
          agentId: acesso.agentId,
          dialeto: acesso.dialeto,
          autorUsuarioId: uid,
          modelo,
          escopo,
          escopoPadrao: acesso.escopoPadrao
            ? { empresa: acesso.escopoPadrao.empresa, filial: acesso.escopoPadrao.filial }
            : undefined,
          signal: op.signal,
          onProgress: (item) => {
            progresso = op.report(item.fase, item.queriesUsadas);
          },
        });
        avisos.push(...perfil.avisos);
        progresso = op.report("concluido", progresso?.queriesUsadas ?? 0);
      } finally {
        registroOperacoesGlobal.finalizar(op.operacaoId);
      }
      await sincronizarEscopoComGrafo(this.skills, this.grafo, acesso.agentId, {
        tabelas: modelo.tabelas.map((tabela) => tabela.nome),
      });
    }

    await this.audit.append({
      usuarioId: uid,
      acessoId: acesso.id,
      tool: "treinar_com_sql",
      sqlEnviado: modelo.sql,
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: Date.now() - started,
    });

    if (this.extras.schemaDriftEnabled !== false) {
      for (const tabela of modelo.tabelas) {
        const deriva = await aplicarDerivaTabelaNoGrafo({
          grafo: this.grafo,
          skills: this.skills,
          cache: this.extras.cache,
          agentId: acesso.agentId,
          tabelaNome: tabela.nome,
        });
        if (deriva.drifted) {
          avisos.push({
            code: "SCHEMA_DRIFT",
            message: `Assinatura de ${tabela.nome} mudou. Skills afetadas foram para revalidação.`,
          });
        }
      }
    }

    const catalog = await this.skills.listByAgent(acesso.agentId);
    const emAndamento = pickSkillInProgress(catalog, modelo.sql);
    const fluxoTreino = await fluxoForAgentSkill(this.grafo, acesso.agentId, emAndamento);
    const hintBase =
      merged.conflitos > 0
        ? "Há conflitos no grafo. Chame resolver_conflito antes de publicar skills."
        : emAndamento
          ? `Grafo atualizado. Continue a skill "${emAndamento.nome}" (${emAndamento.status}): ${fluxoTreino.proximoPasso ?? "validar_skill"}.`
          : `Grafo atualizado. Próximo passo: ${fluxoTreino.proximoPasso ?? "criar_skill"}. Cadastre a skill (criar_skill → descrever params → validar_skill) e só publique se o usuário confirmar.`;
    return {
      success: true,
      dialeto: acesso.dialeto,
      tabelas: modelo.tabelas.map((t) => t.nome),
      colunas: modelo.colunas.map((c) => c.alias),
      relacionamentos: merged.rels,
      conflitos: merged.conflitos,
      fluxoTreino,
      avisos,
      progresso,
      hint:
        avisos.length > 0
          ? `${hintBase} Perfilamento: ${avisos.map((item) => item.message).join(" ")}`
          : hintBase,
    };
  }
}
