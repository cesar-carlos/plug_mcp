import { z } from "zod";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type {
  IntegrationReview,
  ManagedIntegration,
} from "../../domain/persona-v2/integration-management.js";
import {
  integrationCredentialSchema,
  integrationRegistrationSchema,
} from "../../domain/persona-v2/integration-credential.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import type {
  AdministrativeActor,
  AdministrativeContext,
  PersonaAdministrativeAuthorization,
} from "./administrative-authorization.js";
import { assertConsumer } from "../../domain/persona-v2/authorization.js";
import type { PersonaAdministration } from "./administration.js";
export const integrationManagementConfirmationSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  confirmed: z.literal(true),
});
const confirmation = integrationManagementConfirmationSchema;
const ownerCredentials = z.strictObject({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});
const refused = () =>
  new PersonaV2Error(
    "OPERATION_CONFLICT",
    "Integração ou impacto mudou; preserve a edição e revise novamente.",
  );
/** Credentials remain browser-only; non-secret management requires explicit delegated scope. */
export class PersonaIntegrationManagement {
  constructor(
    private readonly s: PersonaServices,
    private readonly admin: PersonaAdministration,
    private readonly authority: Pick<PersonaAdministrativeAuthorization, "run">,
  ) {}
  private allowed(actor: AdministrativeActor, context: AdministrativeContext, id: string): boolean {
    if (typeof actor === "string") return true;
    if (!context.state) return false;
    return assertConsumer(actor, context.state, this.s.now()).every(
      (layer) => layer.managedIntegrationIds?.includes(id) === true,
    );
  }
  async list(
    session: AdministrativeActor,
    personaId: string,
  ): Promise<readonly ManagedIntegration[]> {
    return this.authority.run(session, personaId, "gerenciar_integracoes", async (tx, context) =>
      (await tx.external!.connections(personaId)).filter((item) =>
        this.allowed(session, context, item.id),
      ),
    );
  }
  async create(
    session: string,
    personaId: string,
    raw: unknown,
  ): Promise<{
    id: string;
    version: number;
    active: false;
    credentialsReturned: false;
  }> {
    const input = z
      .strictObject({
        requestId: z.uuid(),
        confirmed: z.literal("create"),
        registration: integrationRegistrationSchema,
        credential: integrationCredentialSchema,
        owner: ownerCredentials,
      })
      .parse(raw);
    // Check ownership before reauthentication; no remote calls while MCP locks are held.
    await this.authority.run(session, personaId, "gerenciar_integracoes", () => Promise.resolve());
    await this.reauthenticate(session, input.owner);
    return this.authority.run(session, personaId, "gerenciar_integracoes", async (tx) => {
      await tx.security.saveIntegration({
        personaId,
        id: input.requestId,
        expectedVersion: 0,
        registration: input.registration,
        credential: input.credential,
      });
      return { id: input.requestId, version: 1, active: false, credentialsReturned: false };
    });
  }
  private async reauthenticate(session: string, owner: z.infer<typeof ownerCredentials>) {
    const initial = await this.admin.validateSession(session);
    // The login/JWT is transient and proves the same Client, never consumer authority.
    const { accessToken } = await this.s.ownerAuth.login(owner.email, owner.password);
    const profile = await this.s.ownerAuth.profile(accessToken);
    if (
      !profile.active ||
      profile.clientId !== initial.owner.hubClientId ||
      this.s.ownerAuth.hubOrigin !== initial.owner.hubOrigin
    )
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Reautentique o mesmo responsável da persona.",
      );
  }
  private async current(
    tx: PersonaTransaction,
    personaId: string,
    id: string,
  ): Promise<IntegrationReview> {
    const impact = await tx.external!.impact(personaId, id);
    if (!impact) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Integração indisponível.");
    return { ...impact, fingerprint: this.s.crypto.sha256Hex(canonicalJson(impact)) };
  }
  async review(
    session: AdministrativeActor,
    personaId: string,
    id: string,
  ): Promise<IntegrationReview> {
    return this.authority.run(session, personaId, "gerenciar_integracoes", (tx, context) => {
      if (!this.allowed(session, context, id))
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Integração indisponível.");
      return this.current(tx, personaId, id);
    });
  }
  private matches(review: IntegrationReview, input: z.infer<typeof confirmation>): void {
    if (
      review.connection.managementVersion !== input.expectedVersion ||
      review.fingerprint !== input.fingerprint
    )
      throw refused();
  }
  async state(
    session: AdministrativeActor,
    personaId: string,
    id: string,
    suspended: boolean,
    raw: unknown,
  ): Promise<{ managementVersion: number; active: false; suspended: boolean }> {
    const input = confirmation.parse(raw);
    return this.authority.run(session, personaId, "gerenciar_integracoes", async (tx, context) => {
      if (!this.allowed(session, context, id))
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Integração indisponível.");
      const current = await this.current(tx, personaId, id);
      this.matches(current, input);
      await tx.external!.changeState(personaId, id, input.expectedVersion, suspended);
      return { managementVersion: input.expectedVersion + 1, active: false, suspended };
    });
  }
  async rotate(
    session: string,
    personaId: string,
    id: string,
    raw: unknown,
  ): Promise<{ version: number; active: false; credentialsReturned: false }> {
    const input = confirmation
      .extend({
        owner: ownerCredentials,
        credential: integrationCredentialSchema,
      })
      .parse(raw);
    await this.reauthenticate(session, input.owner);
    return this.authority.run(session, personaId, "gerenciar_integracoes", async (tx) => {
      const current = await this.current(tx, personaId, id);
      this.matches(current, input);
      const { connection } = current;
      await tx.security.saveIntegration({
        personaId,
        id,
        expectedVersion: connection.version,
        registration: {
          name: connection.name,
          kind: connection.kind,
          destination: connection.destination,
        },
        credential: input.credential,
      });
      return { version: connection.version + 1, active: false, credentialsReturned: false };
    });
  }
}
