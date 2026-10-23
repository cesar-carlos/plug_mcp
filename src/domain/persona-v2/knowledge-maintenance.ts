import { z } from "zod";
import type { KnowledgeOrigin } from "./knowledge-context.js";
import type { ReviewPlanTarget, ReviewPublicationPlan } from "./review-publication.js";
import type { ReviewTask } from "../ports/review-worker.port.js";

export const feedbackInputSchema = z.strictObject({
  skillId: z.uuid(),
  publicationId: z.uuid(),
  itemId: z.string().min(1).max(1000),
  type: z.enum(["erro", "correcao", "lacuna"]),
  content: z.string().trim().min(1).max(4000),
});
export const reviewDecisionSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  dueAt: z.iso.datetime(),
  decision: z.enum(["configurar", "revisado"]),
  reason: z.string().trim().min(1).max(2000),
});
export interface ReviewTarget {
  kind: "privado" | "padrao" | "perfil";
  publicationId: string;
  hash: string;
  personaId: string | null;
  catalogId: string | null;
}
export interface ReviewCalendar {
  version: number;
  dueAt: string;
  ownerId: string;
  decidedAt: string;
  decision: "configurar" | "revisado";
  reason: string;
}
export interface ReviewStatus {
  state: "nao_configurada" | "vencida" | "em_dia";
  version: number;
  dueAt: string | null;
  task: string;
  checkedAt: string;
  blocksExecution: false;
}
export interface ReviewCalendarView extends ReviewStatus {
  notifications: { items: readonly ReviewTask[]; nextCursor: string | null };
  target: ReviewTarget;
  history: readonly ReviewCalendar[];
  nextVersion: number | null;
}
export interface FeedbackReceipt {
  feedbackId: string;
  hash: string;
  version: number;
  state: KnowledgeFeedback["state"];
  trainingChanged: false;
}
export interface KnowledgeFeedback {
  id: string;
  personaId: string;
  tokenId: string;
  grantId: string | null;
  skillId: string;
  publicationId: string;
  publicationHash: string;
  itemId: string;
  origin: KnowledgeOrigin;
  type: "erro" | "correcao" | "lacuna";
  content: string;
  createdAt: string;
  hash: string;
  version: number;
  state: "aberto" | "encaminhado" | "encerrado";
  proposalId: string | null;
  proposalKind: "padrao" | "perfil" | null;
  reviewerId: string | null;
  reason: string | null;
}
export interface KnowledgeMaintenancePort {
  reviewTasks(
    target: ReviewTarget,
    ownerId: string,
    beforeId?: string,
  ): Promise<{ items: readonly ReviewTask[]; nextCursor: string | null }>;
  readReviewTask(target: ReviewTarget, ownerId: string, taskId: string): Promise<void>;
  reviewPlan(target: ReviewPlanTarget): Promise<ReviewPublicationPlan | null>;
  saveReviewPlan(
    target: ReviewPlanTarget,
    dueAt: string,
    ownerId: string,
  ): Promise<ReviewPublicationPlan>;
  bindReviewPlan(hash: string, plan: ReviewPublicationPlan): Promise<void>;
  boundReviewPlan(hash: string): Promise<ReviewPublicationPlan | null>;
  createFeedback(value: KnowledgeFeedback): Promise<void>;
  feedback(personaId: string, id: string): Promise<KnowledgeFeedback | null>;
  listFeedback(
    personaId: string,
    tokenId: string | null,
    beforeId?: string,
  ): Promise<{
    items: readonly KnowledgeFeedback[];
    nextCursor: string | null;
  }>;
  decideFeedback(
    value: KnowledgeFeedback,
    ownerId: string,
    reason: string,
    proposal: { id: string; kind: "padrao" | "perfil" } | null,
  ): Promise<void>;
  calendar(target: ReviewTarget): Promise<ReviewCalendar | null>;
  saveCalendar(target: ReviewTarget, expectedVersion: number, value: ReviewCalendar): Promise<void>;
  reviewHistory(target: ReviewTarget, beforeVersion?: number): Promise<readonly ReviewCalendar[]>;
  audit(
    personaId: string,
    skillId: string,
    publicationId: string,
    ownerId: string | null,
    tokenId: string | null,
    event: string,
  ): Promise<void>;
}
