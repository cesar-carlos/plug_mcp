import { sql } from "drizzle-orm";
import type { DocumentoTreino } from "../../domain/entities/treinamento.js";
import type { TreinamentoRepositoryPort } from "../../domain/ports/treinamento-repository.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { Db } from "./drizzle/db.js";
const stale = (): never => {
  throw new DomainError({
    code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
    message: "A revisão mudou.",
    hint: "Obtenha um novo preview.",
  });
};
export class MemoryTreinamentoRepository implements TreinamentoRepositoryPort {
  private readonly rows: DocumentoTreino[] = [];
  list: TreinamentoRepositoryPort["list"] = (access, tipo, skill) => {
    const latest = new Map<string, DocumentoTreino>();
    for (const row of this.rows)
      if (
        row.acessoId === access &&
        (!tipo || row.tipo === tipo) &&
        (!skill || row.skillId === skill)
      )
        latest.set(row.id, structuredClone(row));
    return Promise.resolve([...latest.values()].sort((a, b) => a.id.localeCompare(b.id)));
  };
  append: TreinamentoRepositoryPort["append"] = (input) => {
    if (input.tipo === "relatorio" && input.expectedVersion !== 0) stale();
    const old = this.rows.filter((r) => r.id === input.id).at(-1);
    if (
      (old?.versao ?? 0) !== input.expectedVersion ||
      (old &&
        (old.acessoId !== input.acessoId ||
          old.tipo !== input.tipo ||
          old.skillId !== input.skillId))
    )
      stale();
    const row = {
      ...input,
      versao: input.expectedVersion + 1,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(structuredClone(row));
    return Promise.resolve(structuredClone(row));
  };
}
export class DrizzleTreinamentoRepository implements TreinamentoRepositoryPort {
  constructor(private readonly db: Db) {}
  list: TreinamentoRepositoryPort["list"] = async (access, tipo, skill) => {
    const result = await this.db.execute(
      sql`SELECT DISTINCT ON (id) id, acesso_id AS "acessoId", skill_id AS "skillId", tipo, versao, conteudo, autor_usuario_id AS "autorUsuarioId", created_at::text AS "createdAt" FROM treinamento_revisao WHERE acesso_id=${access} ${tipo ? sql`AND tipo=${tipo}` : sql``} ${skill ? sql`AND skill_id=${skill}` : sql``} ORDER BY id, versao DESC`,
    );
    return result.rows as unknown as DocumentoTreino[];
  };
  append: TreinamentoRepositoryPort["append"] = async (input) =>
    this.db.transaction(async (tx) => {
      if (input.tipo === "relatorio" && input.expectedVersion !== 0) stale();
      if (input.skillId) {
        const locked = await tx.execute(
          sql`SELECT id, versao FROM skill WHERE id=${input.skillId} AND acesso_id=${input.acessoId} FOR UPDATE`,
        );
        if (
          !locked.rows.length ||
          (input.tipo === "caso" && locked.rows[0]?.versao !== input.conteudo.skillVersao)
        )
          stale();
      }
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.id},0))`);
      const old = await tx.execute(
        sql`SELECT versao, acesso_id, skill_id, tipo FROM treinamento_revisao WHERE id=${input.id} ORDER BY versao DESC LIMIT 1`,
      );
      const row = old.rows[0];
      if (
        Number(row?.versao ?? 0) !== input.expectedVersion ||
        (row &&
          (row.acesso_id !== input.acessoId ||
            row.tipo !== input.tipo ||
            row.skill_id !== input.skillId))
      )
        stale();
      const result = await tx.execute(
        sql`INSERT INTO treinamento_revisao(id, acesso_id, skill_id, tipo, versao, conteudo, autor_usuario_id) VALUES (${input.id},${input.acessoId},${input.skillId},${input.tipo},${input.expectedVersion + 1},${JSON.stringify(input.conteudo)}::jsonb,${input.autorUsuarioId}) RETURNING created_at::text AS "createdAt"`,
      );
      return {
        ...input,
        versao: input.expectedVersion + 1,
        createdAt: String(result.rows[0]?.createdAt),
      };
    });
}
