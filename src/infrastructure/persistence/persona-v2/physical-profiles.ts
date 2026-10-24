import type pg from "pg";
import type {
  PhysicalProfile,
  PhysicalProfilePublication,
  PhysicalProfileTransaction,
} from "../../../domain/persona-v2/physical-profile.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";

export class PostgresPhysicalProfiles implements PhysicalProfileTransaction {
  constructor(private readonly db: pg.PoolClient) {}
  async list(
    input: Parameters<PhysicalProfileTransaction["list"]>[0],
  ): ReturnType<PhysicalProfileTransaction["list"]> {
    const args = [
      input.catalogId,
      input.physicalSourceId,
      input.identityHash,
      input.basePublicationId,
    ];
    const scope =
      "catalog_id=$1 AND physical_source_id=$2 AND identity_hash=$3 AND base_publication_id=$4";
    for (const [table, cursor] of [
      ["physical_profile_v2", input.beforeDraft],
      ["physical_profile_publication_v2", input.beforePublication],
    ] as const) {
      if (cursor) {
        const found = await this.db.query(
          `SELECT id FROM ${table} WHERE ${scope} AND id=$5 AND ($6 OR NOT EXISTS (SELECT 1 FROM physical_profile_suspension_v2 WHERE publication_id=$5))`,
          [...args, cursor, input.includeDrafts],
        );
        if (found.rowCount !== 1)
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Cursor indisponível neste catálogo e base.",
          );
      }
    }
    const drafts = input.includeDrafts
      ? (
          await this.db.query<{ draft: PhysicalProfile }>(
            `SELECT draft FROM physical_profile_v2 WHERE ${scope} AND ($5::uuid IS NULL OR id<$5) ORDER BY id DESC LIMIT 21`,
            [...args, input.beforeDraft ?? null],
          )
        ).rows
      : [];
    const publications = (
      await this.db.query<{ snapshot: PhysicalProfilePublication; suspended: boolean }>(
        `SELECT p.snapshot,(s.publication_id IS NOT NULL) AS suspended FROM physical_profile_publication_v2 p LEFT JOIN physical_profile_suspension_v2 s ON s.publication_id=p.id WHERE p.catalog_id=$1 AND p.physical_source_id=$2 AND p.identity_hash=$3 AND p.base_publication_id=$4 AND ($5::uuid IS NULL OR p.id<$5) AND ($6 OR s.publication_id IS NULL) ORDER BY p.id DESC LIMIT 21`,
        [...args, input.beforePublication ?? null, input.includeDrafts],
      )
    ).rows;
    return {
      drafts: drafts.slice(0, 20).map((r) => r.draft),
      publications: publications
        .slice(0, 20)
        .map((r) => ({ ...r.snapshot, suspended: r.suspended })),
      nextDraftCursor: drafts.length > 20 ? drafts[19]!.draft.id : null,
      nextPublicationCursor:
        publications.length > 20 ? publications[19]!.snapshot.publicationId : null,
    };
  }
  async lockCatalog(catalogId: string): Promise<void> {
    await this.db.query("SELECT id FROM knowledge_catalog_v2 WHERE id=$1 FOR UPDATE", [catalogId]);
  }
  async get(catalogId: string, id: string): Promise<PhysicalProfile | null> {
    const r = await this.db.query<{ draft: PhysicalProfile }>(
      "SELECT draft FROM physical_profile_v2 WHERE catalog_id=$1 AND id=$2 FOR UPDATE",
      [catalogId, id],
    );
    return r.rows[0]?.draft ?? null;
  }
  async save(p: PhysicalProfile, expectedRevision: number | null): Promise<void> {
    if (expectedRevision === null)
      await this.db.query(
        "INSERT INTO physical_profile_v2(id,catalog_id,physical_source_id,identity_hash,base_publication_id,revision,draft) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          p.id,
          p.catalogId,
          p.physicalSourceId,
          p.identityHash,
          p.basePublicationId,
          p.revision,
          JSON.stringify(p),
        ],
      );
    else {
      const r = await this.db.query(
        "UPDATE physical_profile_v2 SET draft=$1,revision=$2 WHERE catalog_id=$3 AND id=$4 AND revision=$5",
        [JSON.stringify(p), p.revision, p.catalogId, p.id, expectedRevision],
      );
      if (r.rowCount !== 1)
        throw new PersonaV2Error("OPERATION_CONFLICT", "Perfil foi alterado; recarregue.");
    }
  }
  async preview(i: Parameters<PhysicalProfileTransaction["preview"]>[0]): Promise<void> {
    await this.db.query(
      "INSERT INTO physical_profile_preview_v2(hash,catalog_id,profile_id,revision,owner_id,catalog_version,evidence_id,evidence_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        i.hash,
        i.profile.catalogId,
        i.profile.id,
        i.profile.revision,
        i.ownerId,
        i.catalogVersion,
        i.evidenceId,
        i.evidenceHash,
        i.expiresAt,
      ],
    );
  }
  async consume(
    hash: string,
    p: PhysicalProfile,
    ownerId: string,
    version: number,
    evidenceId: string,
    evidenceHash: string,
    now: Date,
  ): Promise<boolean> {
    const r = await this.db.query(
      "UPDATE physical_profile_preview_v2 SET consumed_at=$1 WHERE hash=$2 AND catalog_id=$3 AND profile_id=$4 AND revision=$5 AND owner_id=$6 AND catalog_version=$7 AND evidence_id=$8 AND evidence_hash=$9 AND expires_at>$1 AND consumed_at IS NULL RETURNING hash",
      [now, hash, p.catalogId, p.id, p.revision, ownerId, version, evidenceId, evidenceHash],
    );
    return r.rowCount === 1;
  }
  async publish(p: PhysicalProfilePublication): Promise<void> {
    await this.db.query(
      "INSERT INTO physical_profile_publication_v2(id,catalog_id,profile_id,physical_source_id,identity_hash,base_publication_id,snapshot,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        p.publicationId,
        p.catalogId,
        p.id,
        p.physicalSourceId,
        p.identityHash,
        p.basePublicationId,
        JSON.stringify(p),
        p.hash,
      ],
    );
  }
  async publication(catalogId: string, id: string): Promise<PhysicalProfilePublication | null> {
    const r = await this.db.query<{ snapshot: PhysicalProfilePublication; suspended: boolean }>(
      "SELECT p.snapshot,(s.publication_id IS NOT NULL) AS suspended FROM physical_profile_publication_v2 p LEFT JOIN physical_profile_suspension_v2 s ON s.publication_id=p.id WHERE p.catalog_id=$1 AND p.id=$2",
      [catalogId, id],
    );
    const row = r.rows[0];
    return row ? { ...row.snapshot, suspended: row.suspended } : null;
  }
  async suspend(catalogId: string, id: string, ownerId: string): Promise<void> {
    await this.db.query(
      "INSERT INTO physical_profile_suspension_v2(catalog_id,publication_id,owner_id) VALUES($1,$2,$3) ON CONFLICT(publication_id) DO NOTHING",
      [catalogId, id, ownerId],
    );
  }
}
