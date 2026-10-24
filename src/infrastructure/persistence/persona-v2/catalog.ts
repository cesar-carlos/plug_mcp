import type pg from "pg";
import { randomUUID, createHash } from "node:crypto";
import { canonicalJson } from "../../../domain/persona-v2/catalog.js";
import type {
  CatalogPublication,
  PersonaCatalogTransaction,
  PublicationPreview,
  SkillDraft,
  TrainingCase,
  PublishedPackage,
  CatalogTestReport,
} from "../../../domain/persona-v2/catalog.js";
import { PersonaV2Error, type SkillKind } from "../../../domain/persona-v2/model.js";
import type {
  PublicationRunnerId,
  PublicationRunEvidence,
} from "../../../domain/persona-v2/publication-run.js";

interface DraftRow {
  id: string;
  persona_id: string;
  slug: string;
  tipo: SkillKind;
  nome: string;
  revisao: number;
  rascunho: unknown;
  publicacao_ativa_id: string | null;
}
const draftFrom = (r: DraftRow): SkillDraft => ({
  id: r.id,
  personaId: r.persona_id,
  slug: r.slug,
  kind: r.tipo,
  name: r.nome,
  revision: r.revisao,
  training: r.rascunho,
  activePublicationId: r.publicacao_ativa_id,
});

export class PostgresPersonaCatalogTransaction implements PersonaCatalogTransaction {
  constructor(private readonly client: pg.PoolClient) {}
  async list(personaId: string): Promise<readonly SkillDraft[]> {
    const r = await this.client.query<DraftRow>(
      "SELECT * FROM skill_v2 WHERE persona_id=$1 ORDER BY slug",
      [personaId],
    );
    return r.rows.map(draftFrom);
  }
  async find(personaId: string, skillId: string): Promise<SkillDraft | null> {
    const r = await this.client.query<DraftRow>(
      "SELECT * FROM skill_v2 WHERE persona_id=$1 AND id=$2",
      [personaId, skillId],
    );
    return r.rows[0] ? draftFrom(r.rows[0]) : null;
  }
  async create(d: SkillDraft): Promise<void> {
    const r = await this.client.query(
      `INSERT INTO skill_v2(id,persona_id,slug,tipo,nome,revisao,rascunho)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(persona_id,slug) DO NOTHING`,
      [d.id, d.personaId, d.slug, d.kind, d.name, d.revision, JSON.stringify(d.training)],
    );
    if (r.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Slug já existe nesta persona.");
    await this.audit(d.personaId, d.id, "skill_rascunho_criado");
  }
  async update(d: SkillDraft, expectedRevision: number): Promise<void> {
    const r = await this.client.query(
      `UPDATE skill_v2 SET nome=$3,rascunho=$4,revisao=revisao+1
      WHERE persona_id=$1 AND id=$2 AND revisao=$5`,
      [d.personaId, d.id, d.name, JSON.stringify(d.training), expectedRevision],
    );
    if (r.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Rascunho mudou; recarregue antes de salvar.");
    await this.audit(d.personaId, d.id, "skill_rascunho_atualizado");
  }
  async cases(personaId: string, skillId: string): Promise<readonly TrainingCase[]> {
    const r = await this.client.query<{ id: string; obrigatorio: boolean; caso: unknown }>(
      "SELECT * FROM caso_teste_v2 WHERE persona_id=$1 AND skill_id=$2 ORDER BY id",
      [personaId, skillId],
    );
    return r.rows.map((t) => ({ id: t.id, required: t.obrigatorio, content: t.caso }));
  }
  async saveCase(personaId: string, skillId: string, t: TrainingCase): Promise<void> {
    await this.client.query(
      `INSERT INTO caso_teste_v2(id,persona_id,skill_id,obrigatorio,caso)
      VALUES($1,$2,$3,$4,$5)`,
      [t.id, personaId, skillId, t.required, JSON.stringify(t.content)],
    );
    // Test changes invalidate previews/reports through the draft revision, preserving active authority.
    await this.client.query("UPDATE skill_v2 SET revisao=revisao+1 WHERE persona_id=$1 AND id=$2", [
      personaId,
      skillId,
    ]);
    await this.audit(personaId, skillId, "skill_caso_cadastrado");
  }
  async changeCase(
    personaId: string,
    skillId: string,
    test: TrainingCase,
    remove: boolean,
  ): Promise<void> {
    const result = remove
      ? await this.client.query(
          "DELETE FROM caso_teste_v2 WHERE persona_id=$1 AND skill_id=$2 AND id=$3",
          [personaId, skillId, test.id],
        )
      : await this.client.query(
          "UPDATE caso_teste_v2 SET obrigatorio=$4,caso=$5 WHERE persona_id=$1 AND skill_id=$2 AND id=$3",
          [personaId, skillId, test.id, test.required, JSON.stringify(test.content)],
        );
    if (result.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Caso mudou; recarregue antes de editar.");
    await this.audit(personaId, skillId, remove ? "skill_caso_removido" : "skill_caso_atualizado");
  }
  async reports(
    personaId: string,
    skillId: string,
    after?: string,
  ): Promise<readonly CatalogTestReport[]> {
    const result = await this.client.query<{
      id: string;
      revisao: number;
      pacote_hash: string;
      casos_hash: string;
      aprovado: boolean;
      runner_id: string;
      created_at: Date;
      resultados: { id: string; passed: boolean }[];
    }>(
      `SELECT id,revisao,pacote_hash,casos_hash,aprovado,runner_id,created_at,resultados
        FROM relatorio_teste_v2 WHERE persona_id=$1 AND skill_id=$2
        AND ($3::uuid IS NULL OR (created_at,id) < (SELECT created_at,id FROM relatorio_teste_v2 WHERE persona_id=$1 AND skill_id=$2 AND id=$3))
        ORDER BY created_at DESC,id DESC LIMIT 21`,
      [personaId, skillId, after ?? null],
    );
    return result.rows.map((r) => ({
      id: r.id,
      revision: r.revisao,
      packageHash: r.pacote_hash,
      casesHash: r.casos_hash,
      approved: r.aprovado,
      runnerId: r.runner_id,
      createdAt: r.created_at,
      results: r.resultados.map((t) => ({ id: t.id, passed: t.passed })),
    }));
  }
  async approvedReport(
    personaId: string,
    skillId: string,
    revision: number,
    packageHash: string,
    casesHash: string,
  ): Promise<boolean> {
    const r = await this.client.query<{ aprovado: boolean }>(
      `SELECT aprovado FROM relatorio_teste_v2
      WHERE persona_id=$1 AND skill_id=$2 AND revisao=$3 AND pacote_hash=$4 AND casos_hash=$5
      ORDER BY created_at DESC,id DESC LIMIT 1`,
      [personaId, skillId, revision, packageHash, casesHash],
    );
    return r.rows[0]?.aprovado === true;
  }
  async savePreview(p: PublicationPreview): Promise<void> {
    await this.client.query(
      `INSERT INTO publicacao_preview_v2(hash,persona_id,skill_id,responsavel_id,
      revisao,pacote_hash,source_fingerprint,publicacao_anterior_id,expires_at,persona_version,administrative_context)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        p.hash,
        p.personaId,
        p.skillId,
        p.ownerId,
        p.revision,
        p.packageHash,
        p.sourceFingerprint,
        p.previousPublicationId,
        p.expiresAt,
        p.personaVersion,
        p.administrativeContext ?? null,
      ],
    );
  }
  async saveReport(
    personaId: string,
    skillId: string,
    revision: number,
    packageHash: string,
    casesHash: string,
    approved: boolean,
    results: readonly { id: string; passed: boolean }[],
    runnerId: PublicationRunnerId = "persona-federation-fixtures-v1",
    evidence?: PublicationRunEvidence,
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO relatorio_teste_v2(id,persona_id,skill_id,revisao,pacote_hash,casos_hash,runner_id,aprovado,resultados,evidencia)
      VALUES($1,$2,$3,$4,$5,$6,$9,$7,$8,$10)`,
      [
        randomUUID(),
        personaId,
        skillId,
        revision,
        packageHash,
        casesHash,
        approved,
        JSON.stringify(results),
        runnerId,
        evidence ? JSON.stringify(evidence) : null,
      ],
    );
    await this.audit(personaId, skillId, "skill_casos_executados");
  }
  async preview(
    personaId: string,
    skillId: string,
    hash: string,
  ): Promise<PublicationPreview | null> {
    const r = await this.client.query<{
      hash: string;
      persona_id: string;
      skill_id: string;
      responsavel_id: string;
      revisao: number;
      persona_version: number;
      administrative_context: string | null;
      pacote_hash: string;
      source_fingerprint: string;
      publicacao_anterior_id: string | null;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      "SELECT * FROM publicacao_preview_v2 WHERE persona_id=$1 AND skill_id=$2 AND hash=$3 FOR UPDATE",
      [personaId, skillId, hash],
    );
    const p = r.rows[0];
    return p
      ? {
          hash: p.hash,
          personaId: p.persona_id,
          skillId: p.skill_id,
          ownerId: p.responsavel_id,
          revision: p.revisao,
          personaVersion: p.persona_version,
          administrativeContext: p.administrative_context,
          packageHash: p.pacote_hash,
          sourceFingerprint: p.source_fingerprint,
          previousPublicationId: p.publicacao_anterior_id,
          expiresAt: p.expires_at,
          consumedAt: p.consumed_at,
        }
      : null;
  }
  async publish(
    p: CatalogPublication<PublishedPackage>,
    previewHash: string,
    now: Date,
  ): Promise<void> {
    const consumed = await this.client.query(
      `UPDATE publicacao_preview_v2 SET consumed_at=$4
      WHERE persona_id=$1 AND skill_id=$2 AND hash=$3 AND consumed_at IS NULL AND expires_at>$4`,
      [p.personaId, p.skillId, previewHash, now],
    );
    if (consumed.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Preview expirado ou consumido.");
    await this.client.query(
      `INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [p.id, p.personaId, p.skillId, p.revision, JSON.stringify(p.package), p.hash],
    );
    const sources =
      p.package.format !== "persona-federation-v2"
        ? [
            {
              sourceId: p.package.sourceId,
              sourceVersion: p.sourceVersion,
              sourceFingerprint: p.sourceFingerprint,
            },
          ]
        : [...new Map(p.package.dependencies.map((d) => [d.sourceId, d])).values()];
    for (const source of sources)
      await this.client.query(
        `INSERT INTO publicacao_fonte(persona_id,publicacao_id,fonte_id,fonte_version,source_fingerprint)
      VALUES($1,$2,$3,$4,$5)`,
        [p.personaId, p.id, source.sourceId, source.sourceVersion, source.sourceFingerprint],
      );
    if (p.package.format === "persona-federation-v2")
      for (const dependency of p.package.dependencies)
        await this.client.query(
          "INSERT INTO publicacao_dependencia(persona_id,publicacao_id,dependencia_id) VALUES($1,$2,$3)",
          [p.personaId, p.id, dependency.publicationId],
        );
    await this.client.query(
      "UPDATE skill_v2 SET publicacao_ativa_id=$3 WHERE persona_id=$1 AND id=$2",
      [p.personaId, p.skillId, p.id],
    );
    await this.audit(p.personaId, p.skillId, "skill_publicada", p.id);
  }
  async publication(
    personaId: string,
    publicationId: string,
  ): Promise<CatalogPublication<PublishedPackage> | null> {
    const r = await this.client.query<{
      id: string;
      persona_id: string;
      skill_id: string;
      revisao: number;
      pacote: PublishedPackage;
      pacote_hash: string;
      fonte_version: number;
      fonte_id: string;
      source_fingerprint: string;
      suspended_at: Date | null;
    }>(
      `SELECT p.*,f.fonte_id,f.fonte_version,f.source_fingerprint,s.suspended_at FROM publicacao p
      JOIN publicacao_fonte f ON f.persona_id=p.persona_id AND f.publicacao_id=p.id
      LEFT JOIN publicacao_suspensao s ON s.persona_id=p.persona_id AND s.publicacao_id=p.id
      WHERE p.persona_id=$1 AND p.id=$2`,
      [personaId, publicationId],
    );
    const p = r.rows[0];
    if (p?.pacote.format === "persona-federation-v2") {
      const deps = await this.client.query<{ dependencia_id: string }>(
        "SELECT dependencia_id FROM publicacao_dependencia WHERE persona_id=$1 AND publicacao_id=$2",
        [personaId, publicationId],
      );
      const sources = [...new Map(p.pacote.dependencies.map((d) => [d.sourceId, d])).values()];
      if (
        sources.length !== r.rows.length ||
        sources.some(
          (d) =>
            !r.rows.some(
              (row) =>
                row.fonte_id === d.sourceId &&
                row.fonte_version === d.sourceVersion &&
                row.source_fingerprint === d.sourceFingerprint,
            ),
        ) ||
        deps.rows.length !== p.pacote.dependencies.length ||
        p.pacote.dependencies.some(
          (d) => !deps.rows.some((row) => row.dependencia_id === d.publicationId),
        )
      )
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Vínculos da publicação incompatíveis com pacote imutável.",
        );
    }
    return p
      ? {
          id: p.id,
          personaId: p.persona_id,
          skillId: p.skill_id,
          revision: p.revisao,
          package: p.pacote,
          hash: p.pacote_hash,
          sourceVersion: p.fonte_version,
          sourceFingerprint:
            p.pacote.format === "persona-federation-v2"
              ? createHash("sha256").update(canonicalJson(p.pacote.dependencies)).digest("hex")
              : p.source_fingerprint,
          suspendedAt: p.suspended_at,
        }
      : null;
  }
  async suspend(personaId: string, publicationId: string, reason: string): Promise<void> {
    await this.client.query(
      `INSERT INTO publicacao_suspensao(persona_id,publicacao_id,motivo)
      VALUES($1,$2,$3) ON CONFLICT(publicacao_id) DO NOTHING`,
      [personaId, publicationId, reason],
    );
    const p = await this.publication(personaId, publicationId);
    if (p)
      await this.audit(
        personaId,
        p.skillId,
        "skill_publicacao_suspensa",
        publicationId,
        reason === "source_structure_changed" ? "source" : "responsavel",
      );
  }

  private async audit(
    personaId: string,
    skillId: string,
    event: string,
    publicationId?: string,
    origin = "responsavel",
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO audit_v2(id,persona_id,skill_id,publicacao_id,evento,origem,sucesso,resource_version)
      SELECT $1,persona_id,id,$4,$5,$6,true,revisao FROM skill_v2 WHERE persona_id=$2 AND id=$3`,
      [randomUUID(), personaId, skillId, publicationId ?? null, event, origin],
    );
  }
}
