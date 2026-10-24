import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import type { KnowledgeCatalog } from "../../domain/persona-v2/shared-knowledge.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import type {
  AdministrativeActor,
  PersonaAdministrativeAuthorization,
} from "./administrative-authorization.js";
import { assertConsumer } from "../../domain/persona-v2/authorization.js";

/** Remote proof precedes local locks; no promise of distributed atomicity. */
export class PhysicalKnowledgeAuthority {
  constructor(
    private readonly s: PersonaServices,
    private readonly authority: PersonaAdministrativeAuthorization,
    private readonly gateway: SourceQueryGatewayPort,
  ) {}
  async run<T>(
    actor: AdministrativeActor,
    personaId: string,
    sourceId: string,
    catalogId: string,
    role: "reader" | "contributor" | "curator",
    action: (
      tx: PersonaTransaction,
      source: Source,
      ownerId: string,
      catalog: KnowledgeCatalog,
    ) => Promise<T>,
  ): Promise<T> {
    const source = await this.authority.run(actor, personaId, "treinar", async (tx, context) => {
      const source = (await tx.listSources(personaId)).find((s) => s.id === sourceId && s.active);
      if (!source?.identityHash)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
      if (
        typeof actor !== "string" &&
        (!context.state ||
          !assertConsumer(actor, context.state, this.s.now()).every((p) =>
            p.sourceIds.includes(sourceId),
          ))
      )
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte não concedida.");
      return source;
    });
    const lease = await this.gateway.authorize(source, [], {
      requireDatabase: true,
      exactResources: true,
    });
    await lease.revalidate();
    return this.authority.run(actor, personaId, "treinar", async (tx, context) => {
      const current = (await tx.listSources(personaId)).find((s) => s.id === sourceId);
      if (role !== "reader") await tx.profiles?.lockCatalog(catalogId);
      const catalog = await tx.knowledge?.catalog(catalogId, context.ownerId);
      if (
        canonicalJson(current) !== canonicalJson(source) ||
        !catalog ||
        !tx.profiles ||
        (role === "curator" && !["administrator", "curator"].includes(catalog.role)) ||
        (role === "contributor" && catalog.role === "reader")
      )
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Catálogo, papel ou acesso vigente à mesma base indisponível.",
        );
      return action(tx, source, context.ownerId, catalog);
    });
  }
}
