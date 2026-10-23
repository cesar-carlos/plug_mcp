import { expectedSourceFor } from "../../domain/persona-v2/source-discovery.js";
import { z } from "zod";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { SourceCredentialPort } from "../../domain/ports/source-credential.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import type { SqlOperationGatewayPort } from "../../domain/ports/persona-v2.port.js";
import type { SqlOperationTransportPort } from "../../domain/ports/sql-operation-transport.port.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import {
  upstreamPermissionFor,
  validateOperationCommand,
  operationStatementCount,
  OPERATION_FAILURE_CODES,
  type OperationReceipt,
  type SqlOperationCommand,
} from "../../domain/persona-v2/operation.js";
import { SourceTokenManager } from "./source-token-manager.js";
import { verifySourceIdentity } from "./verify-source-identity.js";
import { policyAllowsRead, policyAllowsResource } from "./full-policy.js";
import {
  operationTableFromSql,
  quoteOperationTable,
} from "../../domain/persona-v2/operation-identifiers.js";

const statusSchema = z.object({
  operationId: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  executionId: z.string().min(1),
  state: z.enum([
    "executando",
    "cancelamento_solicitado",
    "concluida",
    "rollback_confirmado",
    "resultado_desconhecido",
    "cancelada",
  ]),
  directlyAffectedRows: z.number().int().min(0).nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  failureCode: z.enum(OPERATION_FAILURE_CODES).optional(),
});
const denied = (message: string): never => {
  throw new PersonaV2Error("AUTHORIZATION_DENIED", message, {
    source: "client_token_rpc",
    hint: "Revise vínculo, banco e permissões da credencial técnica. Nunca repita um lançamento para contornar este portão.",
  });
};

/** Uses the source's own Client credentials. No write retry, OAuth forwarding or SQL rewrite. */
export class PersonaSqlOperationGateway implements SqlOperationGatewayPort {
  private readonly sessions: SourceTokenManager;
  constructor(
    private readonly credentials: SourceCredentialPort,
    private readonly hub: PlugServerGatewayPort,
    private readonly transport: SqlOperationTransportPort,
    private readonly crypto: CryptoPort,
    private readonly hubOrigin: string,
  ) {
    this.sessions = new SourceTokenManager(credentials, hub, crypto);
  }

  discardCredentialSession(credentialId: string): void {
    this.sessions.invalidate(credentialId);
  }
  private async gate(source: Source, command?: SqlOperationCommand) {
    const credential = await this.credentials.find(source.personaId, source.credentialId);
    if (!source.active || credential?.version !== source.credentialVersion)
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Credencial da fonte alterada.");
    const accessToken = await this.sessions.getAccessToken(source);
    const access = await this.hub.getAgentAccessStatus(accessToken, source.agentId);
    if (access.state !== "approved") denied("ClientAgentAccess não aprovado.");
    if (access.sourceIdentity !== 1)
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Agente sem confirmação da identidade na conexão executora.",
      );
    const caps = access.sqlOperations;
    if (command) validateOperationCommand(command);
    if (
      command?.expectedStructure &&
      (caps?.structureGuard !== 1 ||
        access.sourceSchema !== 1 ||
        (command.expectedStructure.resources.some((r) => r.constraints !== undefined) &&
          access.sourceConstraints !== 1))
    )
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Guarda estrutural de operações indisponível.",
      );
    if (
      caps?.version !== 1 ||
      (command &&
        (operationStatementCount(command, source.dialect) > caps.maxSteps ||
          command.maxAffectedRows > caps.maxAffectedRows ||
          command.timeoutMs > caps.timeoutMs))
    )
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Agente sem capacidade SQL v1 ou limites incompatíveis.",
      );
    const clientToken = this.crypto.decrypt(credential.clientTokenEnc);
    const policy = await this.hub.getClientTokenPolicy({
      accessToken,
      agentId: source.agentId,
      clientToken,
    });
    const full = policy.fullPolicy;
    if (!full) throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Policy completa indisponível.");
    if (full.revoked || full.database !== source.database)
      denied("Policy revogada ou banco obrigatório incompatível.");
    if (command) {
      if (command.database !== source.database) denied("Banco da operação divergente.");
      for (const dependency of command.expectedStructure?.resources ?? []) {
        const { resource } = dependency;
        if (
          !policyAllowsRead(
            policy,
            {
              name: [resource.schema, resource.name].filter(Boolean).join("."),
              type: resource.type,
            },
            true,
          )
        )
          denied("Leitura da dependência estrutural não concedida na policy da fonte.");
      }
      for (const step of command.steps) {
        const table = operationTableFromSql(step.sql, step.effect);
        quoteOperationTable(table, source.dialect);
        const permission = upstreamPermissionFor(step.effect);
        const allowed = policyAllowsResource(
          policy,
          { name: table, type: "table" },
          permission,
          true,
        );
        if (!allowed) denied("Comando não concedido na policy da fonte.");
      }
    }
    // Journal reads/cancellation must remain possible without opening the business database.
    if (command)
      await verifySourceIdentity(this.hub, this.credentials, source, { accessToken, clientToken });
    const current = await this.credentials.find(source.personaId, source.credentialId);
    if (current?.version !== credential.version)
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Credencial mudou durante o preflight.");
    return {
      accessToken,
      clientToken,
      agentId: source.agentId,
      expectedSource: expectedSourceFor(source),
      sourcePhysicalId: this.crypto.sha256Hex(
        JSON.stringify([new URL(this.hubOrigin).origin, source.identityHash]),
      ),
    };
  }
  async verifyCapabilitiesAndPolicy(source: Source, command: SqlOperationCommand): Promise<void> {
    await this.gate(source, command);
  }
  async execute(source: Source, command: SqlOperationCommand): Promise<OperationReceipt> {
    const carrier = await this.gate(source, command);
    const raw = await this.transport.operationRpc({
      ...carrier,
      method: "sql.operation.execute",
      reference: command,
      command,
    });
    const receipt = this.receipt(raw, command.operationId, command.fingerprint);
    if (!receipt)
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Execução sem comprovante terminal; consulte o journal.",
      );
    return receipt;
  }
  async get(
    source: Source,
    operationId: string,
    fingerprint: string,
  ): Promise<OperationReceipt | null> {
    const carrier = await this.gate(source);
    return this.receipt(
      await this.transport.operationRpc({
        ...carrier,
        method: "sql.operation.get",
        reference: { operationId, fingerprint, database: source.database },
      }),
      operationId,
      fingerprint,
    );
  }
  async cancel(source: Source, operationId: string, fingerprint: string): Promise<void> {
    const carrier = await this.gate(source);
    this.receipt(
      await this.transport.operationRpc({
        ...carrier,
        method: "sql.operation.cancel",
        reference: { operationId, fingerprint, database: source.database },
      }),
      operationId,
      fingerprint,
    );
  }
  private receipt(raw: unknown, id: string, fingerprint: string): OperationReceipt | null {
    const status = statusSchema.parse(raw);
    if (
      status.operationId !== id ||
      status.fingerprint !== fingerprint ||
      (status.state !== "concluida" && status.directlyAffectedRows !== null) ||
      (status.state === "concluida" && status.directlyAffectedRows === null) ||
      (status.failureCode !== undefined &&
        !["cancelada", "rollback_confirmado", "resultado_desconhecido"].includes(status.state))
    )
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Identidade ou contagem do journal divergente.",
      );
    if (status.state === "executando" || status.state === "cancelamento_solicitado") return null;
    if (!status.completedAt)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Comprovante sem horário de conclusão.");
    return {
      operationId: id,
      fingerprint,
      state: status.state,
      executionId: status.executionId,
      directlyAffectedRows: status.directlyAffectedRows,
      completedAt: status.completedAt,
      ...(status.failureCode !== undefined ? { failureCode: status.failureCode } : {}),
    };
  }
}
