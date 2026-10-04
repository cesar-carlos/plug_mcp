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
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly skills: SkillRepositoryPort) {}

  async latest(acessoId: string, skillId: string): Promise<SkillPublicacao | null> {
    const row =
      this.rows
        .filter((item) => item.acessoId === acessoId && item.skillId === skillId)
        .sort((a, b) => b.publicacaoVersao - a.publicacaoVersao)[0] ?? null;
    return row ? structuredClone(row) : null;
  }

  async publishAtomically(
    input: Parameters<SkillPublicacaoRepositoryPort["publishAtomically"]>[0],
  ): Promise<{ skill: Skill; publicacao: SkillPublicacao }> {
    const before = this.locks.get(input.skillId) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = before.then(() => lock);
    this.locks.set(input.skillId, queue);
    await before;
    try {
      const current = await this.skills.findById(input.skillId);
      const baseline = await this.latest(input.acessoId, input.skillId);
      if (
        !current ||
        current?.acessoId !== input.acessoId ||
        current.status !== "validada" ||
        current.versao !== input.expectedSkillVersion ||
        (input.expectedActiveId !== undefined &&
          (current.publicacaoAtivaId ?? null) !== input.expectedActiveId) ||
        (input.expectedBaseHash !== undefined &&
          (baseline?.pacoteHash ?? null) !== input.expectedBaseHash)
      ) {
        throw new DomainError({
          code: ERROR_CODES.CONFIRMACAO_DESATUALIZADA,
          message: "A skill mudou desde o preview de publicação.",
          hint: "Chame publicar_skill sem confirmação para revisar o diff atual.",
        });
      }
      await input.validarTestesAtuais?.();
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
        pacote: structuredClone(input.pacote),
        pacoteHash: input.pacoteHash,
        origem: "publicacao",
        autorUsuarioId: input.autorUsuarioId,
        createdAt: new Date(),
      };
      this.rows.push(publicacao);
      await this.skills.ativarPublicacao?.(
        skill.id,
        publicacao.id,
        publicacao.pacoteHash,
        publicacao.pacote,
      );
      return {
        skill: (await this.skills.findById(skill.id)) ?? skill,
        publicacao: structuredClone(publicacao),
      };
    } finally {
      release();
      if (this.locks.get(input.skillId) === queue) {
        this.locks.delete(input.skillId);
      }
    }
  }
}
