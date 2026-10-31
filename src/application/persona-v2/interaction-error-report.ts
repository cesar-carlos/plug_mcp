import { z } from "zod";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { assertConsumer } from "../../domain/persona-v2/authorization.js";
import {
  INTERACTION_ERROR_REPORTS_PER_HOUR,
  interactionErrorReportSchema,
  type InteractionErrorPage,
  type InteractionErrorReceipt,
  type InteractionErrorReportInput,
  type StoredInteractionError,
} from "../../domain/persona-v2/interaction-error-report.js";
import { PersonaV2Error, type ConsumerIdentity } from "../../domain/persona-v2/model.js";
import type { PersonaAdministrativeAuthorization } from "./administrative-authorization.js";

const receipt = (reportId: string): InteractionErrorReceipt => ({
  reportId,
  trainingChanged: false,
  authorityChanged: false,
  retryAuthorized: false,
});

const reportText = (input: InteractionErrorReportInput): string =>
  [
    input.question,
    input.categoryDetail ?? "",
    input.error.message,
    input.execution.summary,
    ...input.execution.steps.map((step) => step.note ?? ""),
  ].join("\n");

export class PersonaInteractionErrors {
  constructor(
    private readonly services: PersonaServices,
    private readonly authority: PersonaAdministrativeAuthorization,
  ) {}

  async report(identity: ConsumerIdentity, raw: unknown): Promise<InteractionErrorReceipt> {
    const parsed = interactionErrorReportSchema.safeParse(raw);
    if (!parsed.success) {
      throw new PersonaV2Error("INVALID_PLAN", "Relato de erro inválido.");
    }
    const input = parsed.data;
    if (pareceSegredoEmTexto(reportText(input))) {
      throw new PersonaV2Error("INVALID_PLAN", "Não envie segredos no relato de erro.");
    }
    return this.services.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        const state = await tx.authorization(identity);
        if (!state || !tx.interactionErrors) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Consumidor indisponível.");
        }
        assertConsumer(identity, state, this.services.now());
        const store = tx.interactionErrors;
        if (input.error.supportId) {
          const existing = await store.findBySupport(
            identity.personaId,
            identity.tokenId,
            input.error.supportId,
          );
          if (existing) return receipt(existing);
        }
        if (
          input.skillId &&
          !assertConsumer(identity, state, this.services.now()).every((layer) =>
            layer.skills.some((grant) => grant.skillId === input.skillId),
          )
        ) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "A skill informada não está concedida a este token.",
          );
        }
        if (
          (await store.countRecent(identity.personaId, identity.tokenId)) >=
          INTERACTION_ERROR_REPORTS_PER_HOUR
        ) {
          throw new PersonaV2Error(
            "BUDGET_EXCEEDED",
            "Muitos relatos nesta hora. Aguarde antes de registrar outro erro.",
          );
        }
        const report: StoredInteractionError = {
          id: this.services.crypto.randomId(),
          personaId: identity.personaId,
          tokenId: identity.tokenId,
          question: input.question,
          category: input.category,
          ...(input.categoryDetail ? { categoryDetail: input.categoryDetail } : {}),
          ...(input.skillId ? { skillId: input.skillId } : {}),
          error: input.error,
          execution: input.execution,
          createdAt: this.services.now().toISOString(),
        };
        await tx.setAdministrativeConsumer(identity);
        await store.insert(report);
        return receipt(report.id);
      },
    );
  }

  list(session: string, personaId: string, raw: unknown): Promise<InteractionErrorPage> {
    const { beforeId } = z.strictObject({ beforeId: z.uuid().optional() }).parse(raw);
    return this.authority.run(session, personaId, "treinar", async (tx) => {
      if (!tx.interactionErrors) {
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Relato de erro indisponível.");
      }
      return tx.interactionErrors.list(personaId, beforeId);
    });
  }
}
