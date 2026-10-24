import type { GrantPublication } from "./model";
import { requiredOperationEffects } from "../../../src/domain/persona-v2/operation-effects";

export function publicationGrant(skillId: string, publication: GrantPublication) {
  if (publication.suspendedAt) throw new Error("Publicação suspensa; atualize a lista.");
  const pkg = publication.package;
  if (pkg.format === "persona-external-v2") {
    const training = pkg.training;
    if (
      !training ||
      !("operationId" in training) ||
      !training.operationId ||
      (training.effect !== "consulta" && training.effect !== "acao")
    )
      throw new Error("Contrato externo incompleto.");
    return {
      skillId,
      capabilities: [...pkg.requiredCapabilities],
      effects: [],
      requireHumanApproval: training.effect === "acao",
    };
  }
  if (pkg.format === "persona-sql-operation-v2") {
    if (!pkg.training || !("steps" in pkg.training) || !pkg.dialect)
      throw new Error("Contrato de operação incompleto.");
    return {
      skillId,
      capabilities: [...pkg.requiredCapabilities],
      effects: requiredOperationEffects({
        training: pkg.training,
        dialect: pkg.dialect,
        sharedKnowledge: pkg.sharedKnowledge,
      }),
      // New SQL grants start with additional approval, even for automatic skills.
      requireHumanApproval: true,
    };
  }
  if (pkg.format !== "persona-query-v2" && pkg.format !== "persona-federation-v2")
    throw new Error("Tipo de publicação não suportado neste formulário.");
  return {
    skillId,
    capabilities: [...pkg.requiredCapabilities],
    effects: ["select" as const],
    requireHumanApproval: false,
  };
}

export function publicationEffectsLabel(publication: GrantPublication): string {
  if (publication.suspendedAt) return "Suspensa";
  try {
    const grant = publicationGrant("", publication);
    if (publication.package.format === "persona-external-v2")
      return grant.requireHumanApproval ? "Ação externa · aprovação adicional" : "Consulta externa";
    return grant.effects.join(", ").toUpperCase();
  } catch {
    return "Contrato indisponível — atualize a lista";
  }
}

export function publicationExternalOperations(publication: GrantPublication): string[] {
  if (publication.package.format !== "persona-external-v2") return [];
  publicationGrant("", publication);
  const training = publication.package.training;
  return training && "operationId" in training ? [training.operationId] : [];
}
