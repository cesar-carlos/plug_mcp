import { randomUUID } from "node:crypto";
import type pg from "pg";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import type {
  InteractionErrorPage,
  InteractionErrorStore,
  StoredInteractionError,
} from "../../../domain/persona-v2/interaction-error-report.js";
import { interactionErrorExecutionSchema } from "../../../domain/persona-v2/interaction-error-report.js";

interface ReportRow {
  id: string;
  persona_id: string;
  token_id: string;
  question: string;
  category: StoredInteractionError["category"];
  category_detail: string | null;
  skill_id: string | null;
  error_code: string;
  error_message: string;
  support_id: string | null;
  error_source: StoredInteractionError["error"]["source"] | null;
  error_stage: StoredInteractionError["error"]["stage"] | null;
  error_tool: string | null;
  execution: StoredInteractionError["execution"];
  created_at: Date;
}

const fromRow = (row: ReportRow): InteractionErrorPage["items"][number] => {
  return {
    id: row.id,
    personaId: row.persona_id,
    tokenId: row.token_id,
    ...(row.question === null ? { textExpired: true as const } : { question: row.question }),
    category: row.category,
    ...(row.category_detail ? { categoryDetail: row.category_detail } : {}),
    ...(row.skill_id ? { skillId: row.skill_id } : {}),
    error: {
      code: row.error_code,
      ...(row.error_message === null ? {} : { message: row.error_message }),
      ...(row.support_id ? { supportId: row.support_id } : {}),
      ...(row.error_source ? { source: row.error_source } : {}),
      ...(row.error_stage ? { stage: row.error_stage } : {}),
      ...(row.error_tool ? { tool: row.error_tool } : {}),
    },
    ...(row.execution === null
      ? {}
      : { execution: interactionErrorExecutionSchema.parse(row.execution) }),
    createdAt: row.created_at.toISOString(),
  };
};

export class PostgresInteractionErrors implements InteractionErrorStore {
  constructor(private readonly db: pg.PoolClient) {}

  async findBySupport(
    personaId: string,
    tokenId: string,
    supportId: string,
  ): Promise<string | null> {
    const found = await this.db.query<{ id: string }>(
      `SELECT id FROM interaction_error_report_v2
       WHERE persona_id=$1 AND token_id=$2 AND support_id=$3`,
      [personaId, tokenId, supportId],
    );
    return found.rows[0]?.id ?? null;
  }

  async countRecent(personaId: string, tokenId: string): Promise<number> {
    const found = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM interaction_error_report_v2
       WHERE persona_id=$1 AND token_id=$2 AND created_at > now() - interval '1 hour'`,
      [personaId, tokenId],
    );
    return found.rows[0]?.n ?? 0;
  }

  async insert(report: StoredInteractionError): Promise<void> {
    await this.db.query(
      `INSERT INTO interaction_error_report_v2(
        id,persona_id,token_id,category,skill_id,error_code,support_id,error_source,error_stage,error_tool
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        report.id,
        report.personaId,
        report.tokenId,
        report.category,
        report.skillId ?? null,
        report.error.code,
        report.error.supportId ?? null,
        report.error.source ?? null,
        report.error.stage ?? null,
        report.error.tool ?? null,
      ],
    );
    await this.db.query(
      `INSERT INTO interaction_error_text_v2(id,question,category_detail,error_message,execution) VALUES ($1,$2,$3,$4,$5)`,
      [
        report.id,
        report.question,
        report.categoryDetail ?? null,
        report.error.message,
        JSON.stringify(report.execution),
      ],
    );
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso)
       VALUES($1,$2,$3,'interaction_error.reported','mcp',true)`,
      [randomUUID(), report.personaId, report.tokenId],
    );
  }

  async list(personaId: string, beforeId?: string): Promise<InteractionErrorPage> {
    if (
      beforeId &&
      !(
        await this.db.query(
          "SELECT id FROM interaction_error_report_v2 WHERE persona_id=$1 AND id=$2",
          [personaId, beforeId],
        )
      ).rowCount
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor indisponível.");
    }
    const found = await this.db.query<ReportRow>(
      `SELECT r.id,persona_id,token_id,question,category,category_detail,skill_id,
        error_code,error_message,support_id,error_source,error_stage,error_tool,execution,created_at
       FROM interaction_error_report_v2 r LEFT JOIN interaction_error_text_v2 t ON t.id=r.id AND t.expires_at>statement_timestamp()
       WHERE persona_id=$1 AND ($2::uuid IS NULL OR (created_at,r.id) < (
         SELECT created_at,id FROM interaction_error_report_v2 WHERE persona_id=$1 AND id=$2
       ))
       ORDER BY created_at DESC,r.id DESC LIMIT 21`,
      [personaId, beforeId ?? null],
    );
    const items = found.rows.slice(0, 20).map(fromRow);
    return { items, nextCursor: found.rows.length > 20 ? (items[19]?.id ?? null) : null };
  }
}
