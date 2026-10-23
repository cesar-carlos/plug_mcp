import { assertConsumer } from "../../domain/persona-v2/authorization.js";
import type { AuthorizationSnapshot, ConsumerIdentity } from "../../domain/persona-v2/model.js";
import type { CatalogPublication, QueryPackage } from "../../domain/persona-v2/catalog.js";
import { queryLimits, operationLimits } from "../../domain/persona-v2/execution-limits.js";
import type { OperationLimits, QueryLimits } from "../../domain/persona-v2/execution-limits.js";
import { federationBudget } from "./federation.js";
import type { FederationBudget } from "../../domain/persona-v2/federation.js";

export function consumerQueryLimits(
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  publications: readonly CatalogPublication<QueryPackage>[],
  now: Date,
): QueryLimits {
  return queryLimits(
    ...publications.map((p) => p.package.limits ?? {}),
    ...assertConsumer(identity, state, now).flatMap((layer) => [
      layer.queryLimits ?? {},
      ...publications.map(
        (p) => layer.skills.find((g) => g.skillId === p.skillId)?.queryLimits ?? {},
      ),
    ]),
  );
}
export function consumerFederationLimits(
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  skillId: string,
  published: Partial<FederationBudget>,
  now: Date,
): FederationBudget {
  return federationBudget(
    published,
    ...assertConsumer(identity, state, now).flatMap((layer) => [
      layer.federationLimits ?? {},
      layer.skills.find((g) => g.skillId === skillId)?.federationLimits ?? {},
    ]),
  );
}
export function consumerOperationLimits(
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  skillId: string,
  published: OperationLimits,
  now: Date,
): OperationLimits {
  return operationLimits(
    published,
    ...assertConsumer(identity, state, now).flatMap((layer) => [
      layer.operationLimits ?? {},
      layer.skills.find((g) => g.skillId === skillId)?.operationLimits ?? {},
    ]),
  );
}
