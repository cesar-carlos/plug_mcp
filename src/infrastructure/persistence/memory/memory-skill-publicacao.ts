import { randomUUID } from "node:crypto";
import type {
  SkillPublicacao,
  SkillPublicacaoRepositoryPort,
} from "../../../domain/ports/skill-publicacao-repository.port.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import type { Skill } from "../../../domain/entities/skill.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";

export class InMemorySkillPublicacaoRepository implements SkillPublicacaoRepositoryPort {
  private readonly rows: SkillPublicacao[] = [];

  constructor(private readonly skills: SkillRepositoryPort) {}

  async latest(acessoId: string, skillId: string): Promise<SkillPublicacao | null> {
    return (
      this.rows
        .filter((item) => item.acessoId === acessoId && item.skillId === skillId)
        .sort((a, b) => b.publicacaoVersao - a.publicacaoVersao)[0] ?? null
    );
  }

  async publishAtomically(
    input: Parameters<SkillPublicacaoRepositoryPort["publishAtomically"]>[0],
  ): Promise<{ skill: Skill; publicacao: SkillPublicacao }> {
    const current = await this.skills.findById(input.skillId);
    if (
      !current ||
      current?.acessoId !== input.acessoId ||
      current.status !== "validada" ||
      current.versao !== input.expectedSkillVersion
    ) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "A skill mudou desde o preview de publicação.",
        hint: "Chame publicar_skill sem confirmação para revisar o diff atual.",
      });
    }
    const skill = await this.skills.update(input.skillId, {
      politicaConsulta: input.politicaConsulta,
      status: "publicada",
    });
    const latest = await this.latest(input.acessoId, input.skillId);
    const publicacao: SkillPublicacao = {
      id: randomUUID(),
      acessoId: input.acessoId,
      skillId: input.skillId,
      publicacaoVersao: (latest?.publicacaoVersao ?? 0) + 1,
      skillVersao: skill.versao,
      pacote: { ...input.pacote },
      pacoteHash: input.pacoteHash,
      origem: "publicacao",
      autorUsuarioId: input.autorUsuarioId,
      createdAt: new Date(),
    };
    this.rows.push(publicacao);
    return { skill, publicacao };
  }
}
