import { DomainError } from "../../domain/errors/domain-error.js";
import { expectedSourceFor } from "../../domain/persona-v2/source-discovery.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import type { SourceCredentialPort } from "../../domain/ports/source-credential.port.js";
import type {
  SourceQueryGatewayPort,
  SourceQueryLease,
} from "../../domain/ports/source-query.port.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { SourceTokenManager } from "./source-token-manager.js";
import { verifySourceIdentity } from "./verify-source-identity.js";
import { sourceSchemaResultSchema } from "../../domain/persona-v2/source-schema.js";
import { sourceIdentityMatches } from "../../domain/persona-v2/source-discovery.js";
import { policyAllowsRead } from "./full-policy.js";

const identityMismatch = (error: unknown): boolean =>
  error instanceof DomainError &&
  !!error.details &&
  typeof error.details === "object" &&
  "failureCode" in error.details &&
  error.details.failureCode === "SOURCE_IDENTITY_MISMATCH";

export class PersonaSourceQuery implements SourceQueryGatewayPort {
  private readonly sessions: SourceTokenManager;
  constructor(
    private readonly credentials: SourceCredentialPort,
    private readonly hub: PlugServerGatewayPort,
    private readonly crypto: CryptoPort,
  ) {
    this.sessions = new SourceTokenManager(credentials, hub, crypto);
  }

  discardCredentialSession(credentialId: string): void {
    this.sessions.invalidate(credentialId);
  }

  async authorize(
    source: Source,
    resources: readonly { name: string; type: "table" | "view" }[],
    fences?: {
      readonly exactResources: true;
      readonly requireDatabase: true;
      readonly requireSchema?: true;
      readonly requireConstraints?: true;
    },
  ): Promise<SourceQueryLease> {
    const credential = await this.credentials.find(source.personaId, source.credentialId);
    if (!source.active || credential?.version !== source.credentialVersion) {
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Credencial da fonte alterada.");
    }
    const clientToken = this.crypto.decrypt(credential.clientTokenEnc);
    const accessToken = await this.sessions.getAccessToken(source);
    const check = async (): Promise<string> => {
      const current = await this.credentials.find(source.personaId, source.credentialId);
      if (current?.version !== credential.version) {
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Credencial da fonte alterada.");
      }
      const access = await this.hub.getAgentAccessStatus(accessToken, source.agentId);
      if (access.state !== "approved") {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "ClientAgentAccess não aprovado.", {
          source: "client_agent_access",
          hint: "O responsável precisa regularizar o vínculo Client/Agent. Não altere o SQL nem faça polling automático.",
        });
      }
      if (access.sourceIdentity !== 1)
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Agente sem confirmação da identidade na conexão executora.",
        );
      if (fences?.requireSchema && access.sourceSchema !== 1)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Agente sem sourceSchema v1 vigente.");
      if (fences?.requireConstraints && access.sourceConstraints !== 1) {
        throw new PersonaV2Error(
          "CAPABILITY_UNAVAILABLE",
          "Agente sem sourceConstraints v1 vigente.",
        );
      }
      const policy = await this.hub.getClientTokenPolicy({
        accessToken,
        agentId: source.agentId,
        clientToken,
      });
      const full = policy.fullPolicy;
      if (!full)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Policy completa indisponível.", {
          source: "client_token_rpc",
          hint: "Verifique compatibilidade e disponibilidade da policy do agente. Não altere o SQL para contornar este portão.",
        });
      if (
        full.revoked ||
        (full.database !== null && full.database !== source.database) ||
        (fences?.requireDatabase && full.database !== source.database)
      ) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Policy revogada ou banco incompatível.", {
          source: "client_token_rpc",
          hint: "Peça ao responsável para revisar o token técnico e o banco da fonte. Não repita automaticamente.",
        });
      }
      // The agent ignores resource rules when either global scope flag is enabled.
      // Resource kind is fixed in the published training; the agent also verifies actual resources.
      for (const resource of resources) {
        const allowed = policyAllowsRead(policy, resource, fences?.exactResources === true);
        if (!allowed)
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Leitura não concedida na policy da fonte.",
            {
              source: "client_token_rpc",
              hint: "A publicação não substitui a policy do agente. Utilize somente recursos liberados ou peça revisão ao responsável.",
            },
          );
      }
      await verifySourceIdentity(this.hub, this.credentials, source, { accessToken, clientToken });
      return this.crypto.sha256Hex(canonicalJson(policy));
    };
    const fingerprint = await check();
    const revalidate = async (): Promise<void> => {
      if ((await check()) !== fingerprint) {
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Policy mudou durante a consulta.", {
          source: "client_token_rpc",
          hint: "Renove o contexto após revisão da autorização; resultado anterior não pode ser entregue.",
        });
      }
    };
    return {
      policyFingerprint: fingerprint,
      revalidate,
      inspectSchema: async (inspection) => {
        if (!this.hub.describeSchema)
          throw new PersonaV2Error(
            "CAPABILITY_UNAVAILABLE",
            "Inspeção estrutural indisponível no hub/agente.",
          );
        await revalidate();
        const result = sourceSchemaResultSchema.parse(
          await this.hub
            .describeSchema({
              accessToken,
              agentId: source.agentId,
              clientToken,
              database: source.database,
              expectedSource: expectedSourceFor(source),
              inspection,
            })
            .catch(async (error: unknown) => {
              if (identityMismatch(error)) {
                await this.credentials.invalidateIdentity?.(source);
                throw new PersonaV2Error(
                  "STALE_AUTHORIZATION",
                  "Identidade divergente durante a inspeção; fonte suspensa.",
                );
              }
              throw error;
            }),
        );
        if (!sourceIdentityMatches(source, result.identity)) {
          await this.credentials.invalidateIdentity?.(source);
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Identidade divergente na inspeção estrutural.",
          );
        }
        await revalidate();
        return result;
      },
      execute: async (sql, params, options, expectedStructure) => {
        await revalidate();
        try {
          return await this.hub.executeSql({
            accessToken,
            agentId: source.agentId,
            clientToken,
            database: source.database,
            expectedSource: expectedSourceFor(source),
            ...(expectedStructure ? { expectedStructure } : {}),
            // O classificador do agente exige espaço ASCII depois da palavra inicial.
            sql: sql.replace(/^(select|with)[ \t\r\n]+/i, "$1 "),
            params,
            options,
          });
        } catch (error) {
          if (identityMismatch(error)) {
            await this.credentials.invalidateIdentity?.(source);
            throw new PersonaV2Error(
              "STALE_AUTHORIZATION",
              "Identidade divergente na conexão executora; fonte suspensa.",
              {
                source: "client_token_rpc",
                hint: "Solicite revisão e novo vínculo da fonte. Não reescreva o SQL nem repita a execução.",
              },
            );
          }
          throw error;
        }
      },
    };
  }
}
