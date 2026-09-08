import { and, desc, eq } from "drizzle-orm";
import type { Skill } from "../../../domain/entities/skill.js";
import { parseConsultaSemantica } from "../../../domain/entities/consulta-semantica.js";
import { parseEscopoSkill } from "../../../domain/entities/escopo.js";
import { parseParametroSkillList } from "../../../domain/entities/skill.js";
import { parsePoliticaConsulta } from "../../../domain/entities/politica-consulta.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type {
  SkillPublicacao,
  SkillPublicacaoRepositoryPort,
} from "../../../domain/ports/skill-publicacao-repository.port.js";
import * as schema from "../schema.js";
import type { Db } from "./db.js";

const toSkill = (row: typeof schema.skill.$inferSelect): Skill => ({
  id: row.id,
  acessoId: row.acessoId,
  slug: row.slug,
  nome: row.nome,
  descricao: row.descricao,
  sqlModelo: row.sqlModelo,
  params: parseParametroSkillList(row.params),
  escopo: parseEscopoSkill(row.escopo),
  versao: row.versao,
  pacoteVersao: row.pacoteVersao,
  status: row.status as Skill["status"],
  motivoRevalidacao: row.motivoRevalidacao,
  consultaSemantica: parseConsultaSemantica(row.consultaSemantica),
  politicaConsulta: parsePoliticaConsulta(row.politicaConsulta),
  autorUsuarioId: row.autorUsuarioId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toPublicacao = (row: typeof schema.skillPublicacao.$inferSelect): SkillPublicacao => ({
  id: row.id,
  acessoId: row.acessoId,
  skillId: row.skillId,
  publicacaoVersao: row.publicacaoVersao,
  skillVersao: row.skillVersao,
  pacote: row.pacote,
  pacoteHash: row.pacoteHash,
  origem: row.origem as SkillPublicacao["origem"],
  autorUsuarioId: row.autorUsuarioId,
  createdAt: row.createdAt,
});

export class DrizzleSkillPublicacaoRepository implements SkillPublicacaoRepositoryPort {
  constructor(private readonly db: Db) {}

  async latest(acessoId: string, skillId: string): Promise<SkillPublicacao | null> {
    const [row] = await this.db
      .select()
      .from(schema.skillPublicacao)
      .where(
        and(
          eq(schema.skillPublicacao.acessoId, acessoId),
          eq(schema.skillPublicacao.skillId, skillId),
        ),
      )
      .orderBy(desc(schema.skillPublicacao.publicacaoVersao))
      .limit(1);
    return row ? toPublicacao(row) : null;
  }

  async publishAtomically(
    input: Parameters<SkillPublicacaoRepositoryPort["publishAtomically"]>[0],
  ): Promise<{ skill: Skill; publicacao: SkillPublicacao }> {
    return this.db.transaction(async (tx) => {
      const latest = await tx
        .select({ versao: schema.skillPublicacao.publicacaoVersao })
        .from(schema.skillPublicacao)
        .where(
          and(
            eq(schema.skillPublicacao.acessoId, input.acessoId),
            eq(schema.skillPublicacao.skillId, input.skillId),
          ),
        )
        .orderBy(desc(schema.skillPublicacao.publicacaoVersao))
        .limit(1);
      const [skill] = await tx
        .update(schema.skill)
        .set({
          status: "publicada",
          politicaConsulta: input.politicaConsulta,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.skill.id, input.skillId),
            eq(schema.skill.acessoId, input.acessoId),
            eq(schema.skill.status, "validada"),
            eq(schema.skill.versao, input.expectedSkillVersion),
          ),
        )
        .returning();
      if (!skill) {
        throw new DomainError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "A skill mudou desde o preview de publicação.",
          hint: "Chame publicar_skill sem confirmação para revisar o diff atual.",
        });
      }
      const [publication] = await tx
        .insert(schema.skillPublicacao)
        .values({
          acessoId: input.acessoId,
          skillId: input.skillId,
          publicacaoVersao: (latest[0]?.versao ?? 0) + 1,
          skillVersao: skill.versao,
          pacote: { ...input.pacote },
          pacoteHash: input.pacoteHash,
          origem: "publicacao",
          autorUsuarioId: input.autorUsuarioId,
        })
        .returning();
      return { skill: toSkill(skill), publicacao: toPublicacao(publication!) };
    });
  }
}
