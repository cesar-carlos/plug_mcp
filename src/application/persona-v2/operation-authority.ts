import { requiredOperationEffects } from "../../domain/persona-v2/operation-effects.js";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import type {
  SqlOperationAuthorityPort,
  SqlOperationAuthority,
} from "../../domain/ports/sql-operation-store.port.js";
import { authorizePublication } from "../../domain/persona-v2/authorization.js";
import {
  PersonaV2Error,
  type ConsumerIdentity,
  type AuthorizationSnapshot,
  type Source,
} from "../../domain/persona-v2/model.js";
import { canonicalJson, type CatalogPublication } from "../../domain/persona-v2/catalog.js";
import { operationAuthorizationHash } from "../../domain/persona-v2/operation-authorization.js";
import { sourceFingerprint } from "./query-training.js";
import { compileOperationCommand, type OperationPackage } from "./operation-training.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { compileOperationReconciliation } from "./operation-reconciliation.js";
import { sharedOperationKnowledgeCurrent } from "./shared-operation-adoption.js";
import { consumerOperationLimits } from "./execution-budgets.js";
import { operationLimits } from "../../domain/persona-v2/execution-limits.js";

export function authorizeOperationPublication(
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  p: CatalogPublication<OperationPackage>,
  source: Source,
  crypto: CryptoPort,
  now: Date,
): { requireHumanApproval: boolean } {
  if (
    p.sourceVersion !== source.authorizationVersion ||
    p.sourceFingerprint !== sourceFingerprint(source, crypto) ||
    p.package.sourceFingerprint !== p.sourceFingerprint ||
    p.hash !== crypto.sha256Hex(canonicalJson(p.package)) ||
    p.package.sourceId !== source.id ||
    p.package.dialect !== source.dialect
  )
    throw new PersonaV2Error("STALE_AUTHORIZATION", "Fonte ou publicação da operação alterada.");
  return authorizePublication(
    identity,
    state,
    {
      id: p.id,
      personaId: p.personaId,
      skillId: p.skillId,
      kind: "operacao_sql",
      sourceIds: [source.id],
      externalOperationIds: [],
      requiredCapabilities: p.package.requiredCapabilities,
      effects: requiredOperationEffects(p.package),
      hash: p.hash,
      suspendedAt: p.suspendedAt,
      approval: p.package.training.approval,
    },
    now,
  );
}

export class PublishedSqlOperationAuthority implements SqlOperationAuthorityPort {
  constructor(private readonly services: PersonaServices) {}
  async authorize(
    identity: ConsumerIdentity,
    publicationId: string,
  ): Promise<SqlOperationAuthority> {
    return this.services.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        const state = await tx.authorization(identity);
        const publication = await tx.catalog.publication(identity.personaId, publicationId);
        const skill =
          publication && (await tx.catalog.find(identity.personaId, publication.skillId));
        if (
          !state ||
          publication?.package.format !== "persona-sql-operation-v2" ||
          skill?.kind !== "operacao_sql" ||
          skill.activePublicationId !== publication.id
        )
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Operação publicada indisponível.");
        const pkg = publication.package;
        const source = state.sources.find((s) => s.id === pkg.sourceId);
        if (!source) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
        if (!(await sharedOperationKnowledgeCurrent(tx, state.persona.ownerId, pkg))) {
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Conhecimento compartilhado da operação indisponível.",
          );
        }
        const approval = authorizeOperationPublication(
          identity,
          state,
          { ...publication, package: pkg },
          source,
          this.services.crypto,
          this.services.now(),
        );
        const limits = consumerOperationLimits(
          identity,
          state,
          publication.skillId,
          pkg.training,
          this.services.now(),
        );
        return {
          limits,
          ownerId: state.persona.ownerId,
          source,
          authorizationHash: operationAuthorizationHash(
            identity,
            state,
            publication.hash,
            source,
            this.services.crypto,
          ),
          ...approval,
          command: (id, input, requested) =>
            compileOperationCommand(
              pkg,
              source,
              id,
              input,
              this.services.crypto,
              operationLimits(limits, requested ?? {}),
            ),
          ...(pkg.training.reconciliationQuery
            ? {
                reconciliationQuery: (id: string) =>
                  compileOperationReconciliation(pkg, source, id),
              }
            : {}),
        };
      },
    );
  }
}
