import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { PersonaExternalTransaction } from "../../../domain/ports/persona-external.port.js";
import {
  integrationReferenceSchema,
  integrationRegistrationSchema,
  integrationCredentialSchema,
} from "../../../domain/persona-v2/integration-credential.js";
import {
  externalPackageSchema,
  type ExternalPublication,
} from "../../../domain/persona-v2/external-contract.js";
import { canonicalJson } from "../../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { PostgresExternalActions } from "./external-actions.js";
import type { ExternalRun, ExternalTestReport } from "../../../domain/persona-v2/external-run.js";
import type { TrainingCase } from "../../../domain/persona-v2/catalog.js";
const envelope = z.strictObject({
  personaId: z.uuid(),
  id: z.uuid(),
  version: z.number().int().positive(),
  registration: integrationRegistrationSchema,
  credential: integrationCredentialSchema,
});
export class PostgresPersonaExternal implements PersonaExternalTransaction {
  async connections(personaId: string): ReturnType<PersonaExternalTransaction["connections"]> {
    const result = await this.db.query<{
      id: string;
      name: string;
      kind: string;
      destination: string;
      version: number;
      active: boolean;
      managementVersion: number;
      suspendedAt: Date | null;
    }>(
      'SELECT id,nome AS name,tipo AS kind,destino AS destination,credencial_versao AS version,ativa AS active,versao_gestao AS "managementVersion",suspensa_em AS "suspendedAt" FROM integracao WHERE persona_id=$1 ORDER BY nome,id',
      [personaId],
    );
    return result.rows.map(({ active, managementVersion, suspendedAt, ...reference }) => ({
      ...integrationReferenceSchema.parse(reference),
      active,
      managementVersion,
      suspendedAt: suspendedAt?.toISOString() ?? null,
    }));
  }
  async impact(personaId: string, id: string): ReturnType<PersonaExternalTransaction["impact"]> {
    const connection = (await this.connections(personaId)).find((c) => c.id === id);
    if (!connection) return null;
    const publications = await this.db.query<{
      skillId: string;
      publicationId: string;
      name: string;
      revision: number;
      suspended: boolean;
    }>(
      `SELECT p.skill_id AS "skillId",p.id AS "publicationId",p.pacote->>'name' AS name,p.revisao AS revision,(s.publicacao_id IS NOT NULL) AS suspended FROM publicacao p JOIN publicacao_integracao b ON b.persona_id=p.persona_id AND b.publicacao_id=p.id JOIN integracao_operacao o ON o.persona_id=b.persona_id AND o.id=b.operacao_id LEFT JOIN publicacao_suspensao s ON s.persona_id=p.persona_id AND s.publicacao_id=p.id WHERE p.persona_id=$1 AND o.integracao_id=$2 ORDER BY p.id`,
      [personaId, id],
    );
    const counts = await this.db.query<{ activeOperations: number; pendingOperations: number }>(
      `SELECT (SELECT count(*)::integer FROM integracao_operacao WHERE persona_id=$1 AND integracao_id=$2 AND ativa=true) AS "activeOperations",(SELECT count(*)::integer FROM external_action_v2 WHERE persona_id=$1 AND integracao_id=$2 AND estado IN ('preparada','aprovacao_pendente','aprovada','executando','cancelamento_solicitado','resultado_desconhecido')) AS "pendingOperations"`,
      [personaId, id],
    );
    return {
      connection,
      publications: publications.rows,
      activeOperations: counts.rows[0]!.activeOperations,
      pendingOperations: counts.rows[0]!.pendingOperations,
    };
  }
  async changeState(
    personaId: string,
    id: string,
    expectedVersion: number,
    suspended: boolean,
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE integracao SET ativa=false,suspensa_em=CASE WHEN $4 THEN clock_timestamp() ELSE NULL END,versao_gestao=versao_gestao+1 WHERE persona_id=$1 AND id=$2 AND versao_gestao=$3 AND (suspensa_em IS NOT NULL)<>$4`,
      [personaId, id, expectedVersion, suspended],
    );
    if (result.rowCount !== 1)
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Integração alterada; revise o impacto novamente.",
      );
    await this.db.query(
      "UPDATE integracao_operacao SET ativa=false WHERE persona_id=$1 AND integracao_id=$2",
      [personaId, id],
    );
    await this.db.query(
      `UPDATE publicacao_preview_v2 v SET consumed_at=clock_timestamp() FROM skill_v2 k WHERE k.persona_id=$1 AND k.rascunho->>'integrationId'=$2 AND v.persona_id=k.persona_id AND v.skill_id=k.id AND v.consumed_at IS NULL`,
      [personaId, id],
    );
    await this.db.query(
      `INSERT INTO publicacao_suspensao(persona_id,publicacao_id,motivo) SELECT b.persona_id,b.publicacao_id,'integration_lifecycle_changed' FROM publicacao_integracao b JOIN integracao_operacao o ON o.persona_id=b.persona_id AND o.id=b.operacao_id WHERE o.persona_id=$1 AND o.integracao_id=$2 ON CONFLICT(publicacao_id) DO NOTHING`,
      [personaId, id],
    );
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,integracao_id,evento,origem,sucesso,previous_version,resource_version) VALUES($1,$2,$3,$4,'admin',true,$5,$6)`,
      [
        randomUUID(),
        personaId,
        id,
        suspended ? "integration.suspended" : "integration.recovered",
        expectedVersion,
        expectedVersion + 1,
      ],
    );
  }
  readonly actions: PostgresExternalActions;
  constructor(
    private readonly db: pg.PoolClient,
    private readonly crypto?: CryptoPort,
  ) {
    this.actions = new PostgresExternalActions(db);
  }
  async startRun(run: ExternalRun): Promise<void> {
    const m = run.manifest;
    await this.db.query(
      `INSERT INTO external_runner_v2(id,persona_id,skill_id,fixture_integracao_id,fixture_origin_hash,manifesto,estado)
      VALUES($1,$2,$3,$4,$5,$6,'running')`,
      [
        run.runId,
        m.personaId,
        m.skillId,
        m.fixtureIntegrationId,
        run.fixtureOriginHash,
        JSON.stringify(m),
      ],
    );
    await this.runReport(run, false, []);
  }
  async finishRun(
    run: ExternalRun,
    approved: boolean,
    results: readonly { id: string; passed: boolean }[],
  ): Promise<void> {
    const updated = await this.db.query(
      "UPDATE external_runner_v2 SET estado=$2,completed_at=now() WHERE id=$1 AND estado='running'",
      [run.runId, run.state],
    );
    if (updated.rowCount !== 1)
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Rodada já consumida ou incerta; não repita efeitos.",
      );
    await this.runReport(run, approved, results);
  }
  private async runReport(
    run: ExternalRun,
    approved: boolean,
    results: readonly { id: string; passed: boolean }[],
  ): Promise<void> {
    const m = run.manifest;
    await this.db.query(
      `INSERT INTO relatorio_teste_v2(id,persona_id,skill_id,revisao,pacote_hash,casos_hash,runner_id,aprovado,resultados,external_run_id)
      VALUES($1,$2,$3,$4,$5,$6,'persona-external-fixtures-v1',$7,$8,$9)`,
      [
        randomUUID(),
        m.personaId,
        m.skillId,
        m.revision,
        m.packageHash,
        m.casesHash,
        approved,
        JSON.stringify(results),
        run.runId,
      ],
    );
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,skill_id,evento,origem,sucesso,resource_version)
      VALUES($1,$2,$3,'integration.fixture_run','operator',true,$4)`,
      [randomUUID(), m.personaId, m.skillId, m.revision],
    );
  }
  async reports(
    personaId: string,
    skillId: string,
    afterId?: string,
  ): Promise<readonly ExternalTestReport[]> {
    const r = await this.db.query<ExternalTestReport>(
      `SELECT id,revisao AS revision,pacote_hash AS "packageHash",casos_hash AS "casesHash",
      aprovado AS approved,runner_id AS "runnerId",external_run_id AS "runId",
      (SELECT estado FROM external_runner_v2 e WHERE e.id=relatorio_teste_v2.external_run_id) AS "runState",
      created_at::text AS "createdAt",resultados AS results
      FROM relatorio_teste_v2 WHERE persona_id=$1 AND skill_id=$2
      AND ($3::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM relatorio_teste_v2 WHERE persona_id=$1 AND skill_id=$2 AND id=$3))
      ORDER BY created_at DESC,id DESC LIMIT 51`,
      [personaId, skillId, afterId ?? null],
    );
    return r.rows;
  }
  async changeCase(
    personaId: string,
    skillId: string,
    test: TrainingCase,
    remove: boolean,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO external_case_history_v2(persona_id,skill_id,caso_id,revisao_anterior,obrigatorio,caso)
      SELECT c.persona_id,c.skill_id,c.id,s.revisao,c.obrigatorio,c.caso FROM caso_teste_v2 c
      JOIN skill_v2 s ON s.persona_id=c.persona_id AND s.id=c.skill_id
      WHERE c.persona_id=$1 AND c.skill_id=$2 AND c.id=$3`,
      [personaId, skillId, test.id],
    );
    const result = remove
      ? await this.db.query(
          "DELETE FROM caso_teste_v2 WHERE persona_id=$1 AND skill_id=$2 AND id=$3",
          [personaId, skillId, test.id],
        )
      : await this.db.query(
          "UPDATE caso_teste_v2 SET obrigatorio=$4,caso=$5 WHERE persona_id=$1 AND skill_id=$2 AND id=$3",
          [personaId, skillId, test.id, test.required, JSON.stringify(test.content)],
        );
    if (result.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Caso indisponível ou alterado.");
    await this.db.query("UPDATE skill_v2 SET revisao=revisao+1 WHERE persona_id=$1 AND id=$2", [
      personaId,
      skillId,
    ]);
    await this.db.query(
      `INSERT INTO audit_v2(id,persona_id,skill_id,evento,origem,sucesso)
      VALUES($1,$2,$3,$4,'admin',true)`,
      [
        randomUUID(),
        personaId,
        skillId,
        remove ? "integration.case_removed" : "integration.case_updated",
      ],
    );
  }
  async connection(
    personaId: string,
    id: string,
  ): ReturnType<PersonaExternalTransaction["connection"]> {
    const r = await this.db.query<{
      id: string;
      name: string;
      kind: string;
      destination: string;
      version: number;
      credencial_enc: string;
      ativa: boolean;
      suspensa_em: Date | null;
    }>(
      "SELECT id,nome AS name,tipo AS kind,destino AS destination,credencial_versao AS version,credencial_enc,ativa,suspensa_em FROM integracao WHERE persona_id=$1 AND id=$2 FOR UPDATE",
      [personaId, id],
    );
    const row = r.rows[0];
    if (!row || row.suspensa_em) return null;
    if (!this.crypto) throw new Error("Security keyring required");
    const ref = integrationReferenceSchema.parse({
      id: row.id,
      name: row.name,
      kind: row.kind,
      destination: row.destination,
      version: row.version,
    });
    const e = envelope.parse(JSON.parse(this.crypto.decrypt(row.credencial_enc)));
    if (
      e.personaId !== personaId ||
      e.id !== id ||
      e.version !== ref.version ||
      canonicalJson(e.registration) !==
        canonicalJson({ name: ref.name, kind: ref.kind, destination: ref.destination })
    )
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Credencial incompatível com integração.");
    return { ...ref, credential: e.credential, active: row.ativa === true };
  }
  async publication(personaId: string, skillId: string): Promise<ExternalPublication | null> {
    const r = await this.db.query<{
      id: string;
      revisao: number;
      pacote: unknown;
      pacote_hash: string;
      suspended_at: Date | null;
      operation_id: string;
      integracao_id: string;
      contrato: unknown;
      operation_active: boolean;
      integration_active: boolean;
    }>(
      `SELECT p.*,s.suspended_at,o.id AS operation_id,o.integracao_id,o.contrato,o.ativa AS operation_active,i.ativa AS integration_active
      FROM skill_v2 k JOIN publicacao p ON p.persona_id=k.persona_id AND p.id=k.publicacao_ativa_id
      JOIN publicacao_integracao b ON b.persona_id=p.persona_id AND b.publicacao_id=p.id
      JOIN integracao_operacao o ON o.persona_id=b.persona_id AND o.id=b.operacao_id AND o.contrato_hash=b.contrato_hash
      JOIN integracao i ON i.persona_id=o.persona_id AND i.id=o.integracao_id
      LEFT JOIN publicacao_suspensao s ON s.persona_id=p.persona_id AND s.publicacao_id=p.id
      WHERE k.persona_id=$1 AND k.id=$2 AND k.tipo='acao_externa'`,
      [personaId, skillId],
    );
    if (r.rows.length !== 1) return null;
    const row = r.rows[0];
    if (!row || !row.operation_active || !row.integration_active) return null;
    const pkg = externalPackageSchema.parse(row.pacote);
    if (
      this.crypto?.sha256Hex(canonicalJson(pkg)) !== row.pacote_hash ||
      pkg.training.operationId !== row.operation_id ||
      pkg.training.integrationId !== row.integracao_id ||
      canonicalJson(pkg.training) !== canonicalJson(row.contrato)
    )
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Contrato externo incompatível.");
    return {
      id: row.id,
      personaId,
      skillId,
      revision: row.revisao,
      hash: row.pacote_hash,
      package: pkg,
      suspendedAt: row.suspended_at,
    };
  }
  async publish(p: ExternalPublication, previewHash: string, now: Date): Promise<void> {
    const consumed = await this.db.query(
      "UPDATE publicacao_preview_v2 SET consumed_at=$4 WHERE persona_id=$1 AND skill_id=$2 AND hash=$3 AND consumed_at IS NULL AND expires_at>$4",
      [p.personaId, p.skillId, previewHash, now],
    );
    if (consumed.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Preview expirou ou já foi usado.");
    const t = p.package.training;
    await this.db.query(
      `INSERT INTO integracao_operacao(id,persona_id,integracao_id,nome,contrato,contrato_hash,efeito,ativa) VALUES($1,$2,$3,$4,$5,$6,$7,true)`,
      [
        t.operationId,
        p.personaId,
        t.integrationId,
        p.package.name,
        JSON.stringify(t),
        p.hash,
        t.effect,
      ],
    );
    await this.db.query(
      "INSERT INTO publicacao(id,persona_id,skill_id,revisao,pacote,pacote_hash) VALUES($1,$2,$3,$4,$5,$6)",
      [p.id, p.personaId, p.skillId, p.revision, JSON.stringify(p.package), p.hash],
    );
    await this.db.query(
      "INSERT INTO publicacao_integracao(persona_id,publicacao_id,operacao_id,contrato_hash) VALUES($1,$2,$3,$4)",
      [p.personaId, p.id, t.operationId, p.hash],
    );
    const updated = await this.db.query(
      "UPDATE skill_v2 SET publicacao_ativa_id=$3 WHERE persona_id=$1 AND id=$2 AND revisao=$4",
      [p.personaId, p.skillId, p.id, p.revision],
    );
    if (updated.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Rascunho alterado.");
    const activated = await this.db.query(
      "UPDATE integracao SET ativa=true,versao_gestao=versao_gestao+1 WHERE persona_id=$1 AND id=$2 AND credencial_versao=$3 AND suspensa_em IS NULL",
      [p.personaId, t.integrationId, p.package.credentialVersion],
    );
    if (activated.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Credencial alterada.");
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,skill_id,publicacao_id,integracao_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,$4,$5,'integration.published','admin',true,$6)",
      [randomUUID(), p.personaId, p.skillId, p.id, t.integrationId, p.revision],
    );
  }
  async record(
    personaId: string,
    tokenId: string,
    p: ExternalPublication,
    success: boolean,
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,skill_id,publicacao_id,integracao_id,evento,origem,sucesso) VALUES($1,$2,$3,$4,$5,$6,'integration.read','mcp',$7)",
      [
        randomUUID(),
        personaId,
        tokenId,
        p.skillId,
        p.id,
        p.package.training.integrationId,
        success,
      ],
    );
  }
}
