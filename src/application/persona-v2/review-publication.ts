import { z } from "zod";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type {
  KnowledgeMaintenancePort,
  ReviewTarget,
} from "../../domain/persona-v2/knowledge-maintenance.js";
import type {
  ReviewPlanTarget,
  ReviewPublicationPlan,
} from "../../domain/persona-v2/review-publication.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
export async function publicationReviewPlan(
  port: KnowledgeMaintenancePort | undefined,
  target: ReviewPlanTarget,
  owner: string,
  now: Date,
  dueAt?: unknown,
  allowSet = true,
): Promise<ReviewPublicationPlan> {
  if (!port) {
    throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Plano de revisão indisponível.");
  }
  if (dueAt !== undefined) {
    if (!allowSet) {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "O responsável deve definir o prazo de revisão no console.",
      );
    }
    const date = z.iso.datetime().parse(dueAt);
    if (Date.parse(date) <= now.getTime()) {
      throw new PersonaV2Error("INVALID_PLAN", "Escolha um prazo futuro de revisão.");
    }
    await port.saveReviewPlan(target, date, owner);
  }
  const plan = await port.reviewPlan(target);
  if (!plan || Date.parse(plan.dueAt) <= now.getTime()) {
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Defina um prazo futuro de revisão para este rascunho e conteúdo.",
    );
  }
  return plan;
}
export async function confirmPublicationReview(
  port: KnowledgeMaintenancePort | undefined,
  target: ReviewPlanTarget,
  previewHash: string,
  now: Date,
): Promise<ReviewPublicationPlan> {
  const plan = await port?.reviewPlan(target),
    bound = await port?.boundReviewPlan(previewHash);
  if (
    !plan ||
    !bound ||
    canonicalJson(plan) !== canonicalJson(bound) ||
    Date.parse(plan.dueAt) <= now.getTime()
  ) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Prazo de revisão ausente, vencido ou alterado; gere nova prévia.",
    );
  }
  return plan;
}
export async function createPublicationCalendar(
  port: KnowledgeMaintenancePort,
  target: ReviewTarget,
  plan: ReviewPublicationPlan,
  now: Date,
): Promise<void> {
  await port.saveCalendar(target, 0, {
    version: 1,
    dueAt: plan.dueAt,
    ownerId: plan.ownerId,
    decidedAt: now.toISOString(),
    decision: "configurar",
    reason: "Prazo escolhido pelo responsável na revisão da publicação.",
  });
}
