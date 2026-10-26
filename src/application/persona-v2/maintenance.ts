import { z } from "zod";
import type { PersonaBrowserCommitGuard } from "../../domain/ports/persona-security.port.js";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { SourceConnectionLifecyclePort } from "../../domain/ports/source-credential.port.js";
import {
  PersonaV2Error,
  type Persona,
  type Source,
  type SourcePublicationImpact,
} from "../../domain/persona-v2/model.js";
import { sourceRestrictionsSchema } from "../../domain/persona-v2/source-restrictions.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import type { PersonaAdministration } from "./administration.js";
import { PersonaConsumerCatalog } from "./consumer-catalog.js";
import {
  canonicalJson,
  type CatalogPublication,
  type PublishedPackage,
} from "../../domain/persona-v2/catalog.js";
import { sourceFingerprint } from "./query-training.js";
import { sourceReplacementSchema } from "./source-registration.js";
import type {
  PersonaProgress,
  ProgressStep,
  HistoryPage,
} from "../../domain/persona-v2/console.js";

export const historyFilterSchema = z
  .strictObject({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    event: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,99}$/)
      .optional(),
    resourceId: z.uuid().optional(),
    afterAt: z.iso.datetime({ offset: true }).optional(),
    afterId: z.uuid().optional(),
  })
  .refine((f) => (f.afterAt === undefined) === (f.afterId === undefined), "Cursor incompleto.")
  .refine((f) => !f.from || !f.to || Date.parse(f.from) <= Date.parse(f.to), "Período inválido.");

const version = z.number().int().positive();
export const personaUpdateSchema = z.strictObject({
  expectedVersion: version,
  name: z.string().trim().min(1).max(200),
  specialty: z.string().trim().min(1).max(5000),
  instructions: z.string().max(20000),
});
export const personaIconSchema = z.strictObject({
  expectedRevision: z.number().int().min(0).max(1_000_000),
  bytes: z.instanceof(Uint8Array).nullable(),
});
export const personaStateSchema = z.strictObject({ expectedVersion: version });
export const sourceUpdateSchema = z.strictObject({
  expectedVersion: version,
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(5000),
  environment: z.string().trim().min(1).max(100),
  rowRestrictions: sourceRestrictionsSchema,
});
export const sourceCredentialUpdateSchema = z.strictObject({
  expectedVersion: version,
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
  clientToken: z.string().min(1).max(8192),
});
export const sourceStateSchema = z.strictObject({ expectedVersion: version });
export const sourceRecoverySchema = sourceStateSchema.extend({
  credentials: sourceCredentialUpdateSchema.omit({ expectedVersion: true }).optional(),
});

/** Owner-only maintenance. Source identity cannot be edited or rebound by rotating credentials. */
export class PersonaMaintenance {
  constructor(
    private readonly services: PersonaServices,
    private readonly administration: PersonaAdministration,
    private readonly connections: SourceConnectionLifecyclePort,
  ) {}

  async history(sessionId: string, personaId: string, raw: unknown): Promise<HistoryPage> {
    z.uuid().parse(personaId);
    const { afterAt, afterId, ...filter } = historyFilterSchema.parse(raw);
    return this.owned(
      sessionId,
      personaId,
      (tx) =>
        tx.history(personaId, {
          ...filter,
          ...(afterAt && afterId ? { after: { at: afterAt, id: afterId } } : {}),
        }),
      true,
    );
  }

  async progress(sessionId: string, personaId: string): Promise<PersonaProgress> {
    z.uuid().parse(personaId);
    return this.owned(sessionId, personaId, async (tx) => {
      const persona = (await tx.findPersona(personaId))!;
      const sources = await tx.listSources(personaId);
      const drafts = await tx.catalog.list(personaId);
      const tokens = await tx.listTokens(personaId);
      const catalog = new PersonaConsumerCatalog(this.services);
      let permitted = false;
      for (const token of tokens) {
        if (
          !persona.active ||
          token.revokedAt ||
          (token.expiresAt && token.expiresAt <= this.services.now())
        )
          continue;
        const identity = {
          personaId,
          tokenId: token.id,
          tokenVersion: token.authorizationVersion,
          personaVersion: persona.authorizationVersion,
        };
        const state = await tx.authorization(identity);
        if (
          state &&
          (await catalog.diagnoseInTransaction(tx, identity, state)).some(
            (s) => s.state === "permitido" && s.kind === "consulta",
          )
        ) {
          permitted = true;
          break;
        }
      }
      const publications = await Promise.all(
        drafts
          .filter((d) => d.activePublicationId)
          .map((d) => tx.catalog.publication(personaId, d.activePublicationId!)),
      );
      const current = (p: CatalogPublication<PublishedPackage> | null): boolean => {
        if (
          !p ||
          p.suspendedAt ||
          drafts.find((d) => d.id === p.skillId)?.activePublicationId !== p.id ||
          p.hash !== this.services.crypto.sha256Hex(canonicalJson(p.package))
        )
          return false;
        if (p.package.format === "persona-federation-v2")
          return p.package.dependencies.every((d) => {
            const child = publications.find((v) => v?.id === d.publicationId);
            return (
              child?.package.format === "persona-query-v2" &&
              child.skillId === d.skillId &&
              child.hash === d.hash &&
              child.sourceVersion === d.sourceVersion &&
              child.sourceFingerprint === d.sourceFingerprint &&
              child.package.sourceId === d.sourceId &&
              current(child)
            );
          });
        const sourceId = p.package.sourceId;
        const source = sources.find((s) => s.id === sourceId);
        return (
          !!source?.active &&
          p.sourceVersion === source.authorizationVersion &&
          p.sourceFingerprint === sourceFingerprint(source, this.services.crypto)
        );
      };
      const active = persona.active && publications.some(current);
      const hasSource = sources.some((s) => s.active && s.identityHash && s.identityVerifiedAt);
      const lastQueryAt = await tx.lastCompletedQuery(personaId);
      const lastConnectionAt = await tx.lastConsumerConnection(personaId);
      const steps: ProgressStep[] = [
        {
          id: "persona",
          label: "Persona",
          state: persona.active ? "concluido" : "bloqueado",
          reason: persona.active
            ? "Cadastro criado e ativo. A persona pode existir sem bases."
            : "Persona suspensa. Nenhum token pode executar capacidades até a recuperação autorizada.",
          area: "overview",
          action: "Revisar especialidade",
        },
        {
          id: "sources",
          label: "Bases",
          state: hasSource ? "concluido" : sources.length ? "bloqueado" : "disponivel",
          reason: hasSource
            ? "Há fonte ativa com identidade registrada. Disponibilidade remota exige nova verificação."
            : sources.length
              ? "Revise os vínculos suspensos ou sem prova de identidade."
              : "Cadastre a primeira base com os cinco campos técnicos.",
          area: "sources",
          action: "Administrar bases",
        },
        {
          id: "knowledge",
          label: "Conhecimento",
          state: drafts.length ? "concluido" : hasSource ? "disponivel" : "pendente",
          reason: drafts.length
            ? "Há treinamento privado cadastrado. Catálogo compartilhado é opcional; cadastro não prova significado."
            : "Use treinamento privado. A adoção executável de padrões ainda depende de inspeção e compatibilidade.",
          area: "training",
          action: "Organizar conhecimento",
        },
        {
          id: "training",
          label: "Treinamento",
          state: drafts.length ? "concluido" : hasSource ? "disponivel" : "pendente",
          reason: drafts.length
            ? "Há rascunho salvo. Revise regras, fontes e casos antes da publicação."
            : "Cadastre estrutura, exemplos, parâmetros e regras da fonte.",
          area: "training",
          action: "Revisar treinamento",
        },
        {
          id: "publication",
          label: "Publicação",
          state: active ? "concluido" : drafts.length ? "disponivel" : "pendente",
          reason: active
            ? "Há publicação sem suspensão registrada. O servidor confere todas as dependências a cada uso."
            : "Gere preview atual e resolva os casos exigidos para publicar.",
          area: "training",
          action: "Revisar publicação",
        },
        {
          id: "permissions",
          label: "Permissões",
          state: permitted ? "concluido" : active ? "disponivel" : "pendente",
          reason: permitted
            ? "Há token vigente com concessão local de consulta utilizável. Portões remotos não verificados."
            : "Emita ou revise um token com concessões explícitas para a publicação e suas fontes.",
          area: "tokens",
          action: "Revisar tokens",
        },
        {
          id: "connection",
          label: "Conexão",
          state: lastConnectionAt ? "concluido" : permitted ? "disponivel" : "pendente",
          reason: lastConnectionAt
            ? "Há autenticação e diagnóstico do consumidor registrados. Teste novamente para verificar o token atual."
            : "Informe o Bearer para testar a experiência real do consumidor. Uma emissão anterior não comprova conexão atual.",
          area: "tokens",
          action: "Testar conexão",
        },
        {
          id: "query",
          label: "Primeira consulta",
          state: lastQueryAt ? "concluido" : permitted ? "disponivel" : "pendente",
          reason: lastQueryAt
            ? "Há execução registrada. Isso não comprova acesso atual nem que uma página representa o total."
            : "Escolha uma publicação concedida, valide o SQL e consulte explicitamente.",
          area: "queries",
          action: "Consultar dados",
        },
      ];
      return {
        checkedAt: this.services.now().toISOString(),
        steps,
        currentAvailabilityVerified: false,
        lastQueryAt,
      };
    });
  }

  private async owned<T>(
    sessionId: string,
    personaId: string,
    action: (tx: PersonaTransaction) => Promise<T>,
    allowInactive = false,
  ): Promise<T> {
    const session = await this.administration.validateSession(sessionId);
    return this.services.repository.transaction(
      { personaIds: [personaId], tokenIds: [] },
      async (tx) => {
        const persona = await tx.findPersona(personaId);
        if (
          !persona ||
          (!persona.active && !allowInactive) ||
          persona.ownerId !== session.owner.id
        ) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Persona indisponível para este responsável.",
          );
        }
        await tx.setAdministrativeActor(session.owner.id);
        return action(tx);
      },
      () => {
        if (session.expiresAt <= this.services.now()) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão expirou antes da gravação.");
        }
        return Promise.resolve();
      },
    );
  }

  async personaIcon(
    sessionId: string,
    personaId: string,
  ): Promise<{ revision: number; hasIcon: boolean }> {
    z.uuid().parse(personaId);
    return this.owned(sessionId, personaId, async (tx) => {
      const icon = await tx.readPersonaIcon(personaId);
      return { revision: icon?.revision ?? 0, hasIcon: !!icon?.bytes.length };
    });
  }

  async setPersonaIcon(
    sessionId: string,
    personaId: string,
    raw: unknown,
  ): Promise<{ revision: number; hasIcon: boolean }> {
    z.uuid().parse(personaId);
    const input = personaIconSchema.parse(raw);
    return this.owned(sessionId, personaId, async (tx) => {
      const current = (await tx.readPersonaIcon(personaId))?.revision ?? 0;
      this.assertVersion(current, input.expectedRevision);
      if (input.bytes === null) {
        if (current === 0) return { revision: 0, hasIcon: false };
        await tx.clearPersonaIcon(personaId, current);
        return { revision: current + 1, hasIcon: false };
      }
      return { revision: await tx.savePersonaIcon(personaId, input.bytes, current), hasIcon: true };
    });
  }

  async updatePersona(sessionId: string, personaId: string, raw: unknown): Promise<Persona> {
    const { expectedVersion, ...input } = personaUpdateSchema.parse(raw);
    this.assertMetadata(input);
    return this.owned(sessionId, personaId, async (tx) => {
      const current = (await tx.findPersona(personaId))!;
      this.assertVersion(current.authorizationVersion, expectedVersion);
      const next = { ...current, ...input, authorizationVersion: expectedVersion + 1 };
      await tx.updatePersona(next, expectedVersion);
      return next;
    });
  }

  async changePersonaState(
    sessionId: string,
    personaId: string,
    active: boolean,
    raw: unknown,
  ): Promise<Persona> {
    z.uuid().parse(personaId);
    const { expectedVersion } = personaStateSchema.parse(raw);
    const persona = await this.owned(
      sessionId,
      personaId,
      async (tx) => {
        const current = (await tx.findPersona(personaId))!;
        this.assertVersion(current.authorizationVersion, expectedVersion);
        if (current.active === active) {
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Persona já está nesse estado; recarregue.",
          );
        }
        const next = { ...current, active, authorizationVersion: expectedVersion + 1 };
        await tx.changePersonaState(next, expectedVersion, this.services.now());
        return { next, sources: await tx.listSources(personaId) };
      },
      true,
    );
    for (const source of persona.sources) {
      this.connections.discardSession(source.credentialId);
    }
    return persona.next;
  }

  async sourceImpact(
    sessionId: string,
    personaId: string,
    sourceId: string,
    expectedVersion: number,
  ): Promise<SourcePublicationImpact & { sourceVersion: number }> {
    z.uuid().parse(personaId);
    z.uuid().parse(sourceId);
    version.parse(expectedVersion);
    return this.owned(sessionId, personaId, async (tx) => {
      await this.source(tx, personaId, sourceId, expectedVersion, true, true);
      return {
        sourceVersion: expectedVersion,
        ...(await tx.sourcePublicationImpact(personaId, sourceId)),
      };
    });
  }

  async updateSource(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<Source> {
    const { expectedVersion, ...input } = sourceUpdateSchema.parse(raw);
    this.assertMetadata(input);
    const source = await this.owned(sessionId, personaId, async (tx) => {
      const current = await this.source(tx, personaId, sourceId, expectedVersion);
      const next = { ...current, ...input, authorizationVersion: expectedVersion + 1 };
      await tx.updateSource(next, expectedVersion);
      return next;
    });
    this.connections.discardSession(source.credentialId);
    return source;
  }

  async changeSourceState(
    sessionId: string,
    personaId: string,
    sourceId: string,
    active: boolean,
    raw: unknown,
  ): Promise<Source> {
    z.uuid().parse(personaId);
    z.uuid().parse(sourceId);
    const input: z.infer<typeof sourceRecoverySchema> = active
      ? sourceRecoverySchema.parse(raw)
      : sourceStateSchema.parse(raw);
    const current = await this.owned(sessionId, personaId, (tx) =>
      this.source(tx, personaId, sourceId, input.expectedVersion, true),
    );
    if (current.active === active) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Fonte já está nesse estado; recarregue.");
    }
    const credentials = input.credentials;
    let verifiedAt = current.identityVerifiedAt;
    if (active) {
      if (credentials && !this.services.sourceVerifier)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Verificador de fontes indisponível.");
      const proof = credentials
        ? await this.services.sourceVerifier!.verify({
            ...credentials,
            agentId: current.agentId,
            database: current.database,
            dialect: current.dialect,
          })
        : await this.connections.verifyIdentity(current);
      if (
        proof.database !== current.database ||
        proof.dialect !== current.dialect ||
        proof.identityHash !== current.identityHash
      ) {
        await this.owned(sessionId, personaId, (tx) =>
          this.source(tx, personaId, sourceId, input.expectedVersion, true),
        );
        await this.connections.invalidateIdentity(current);
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Identidade divergente; mantenha o vínculo suspenso e revise uma substituição explícita.",
        );
      }
      verifiedAt = proof.verifiedAt;
    }
    // Revalidate the owner and CAS after the remote proof; no network holds a DB transaction.
    const updated = await this.owned(sessionId, personaId, async (tx) => {
      const source = await this.source(tx, personaId, sourceId, input.expectedVersion, true);
      if (source.active === active)
        throw new PersonaV2Error("OPERATION_CONFLICT", "Estado da fonte mudou; recarregue.");
      const next = {
        ...source,
        active,
        authorizationVersion: source.authorizationVersion + 1,
        credentialVersion: source.credentialVersion + (credentials ? 1 : 0),
        identityVerifiedAt: verifiedAt,
      };
      await tx.changeSourceState(
        next,
        input.expectedVersion,
        credentials
          ? {
              emailEnc: this.services.crypto.encrypt(credentials.email),
              passwordEnc: this.services.crypto.encrypt(credentials.password),
              clientTokenEnc: this.services.crypto.encrypt(credentials.clientToken),
            }
          : undefined,
      );
      return next;
    });
    this.connections.discardSession(updated.credentialId);
    return updated;
  }

  async replaceSource(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<Source> {
    z.uuid().parse(personaId);
    z.uuid().parse(sourceId);
    const input = sourceReplacementSchema.parse(raw);
    const previous = await this.owned(sessionId, personaId, async (tx) => {
      const source = (await tx.listSources(personaId)).find((s) => s.id === sourceId);
      if (!source)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Vínculo indisponível para substituição.");
      this.assertVersion(source.authorizationVersion, input.expectedVersion);
      if (source.replacedBySourceId)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Vínculo indisponível para substituição.");
      return source;
    });
    const replacement = await this.administration.replaceSource(
      sessionId,
      personaId,
      sourceId,
      input,
    );
    this.connections.discardSession(previous.credentialId);
    return replacement;
  }

  async rotateSourceCredential(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
    guard?: PersonaBrowserCommitGuard,
  ): Promise<Source> {
    const input = sourceCredentialUpdateSchema.parse(raw);
    const current = await this.owned(sessionId, personaId, (tx) =>
      this.source(tx, personaId, sourceId, input.expectedVersion),
    );
    if (!this.services.sourceVerifier) {
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Verificador de fontes indisponível.");
    }
    // The hub/agente validates the new account, access, policy, dialect and physical identity.
    // No network call holds a local transaction open, and failed authentication changes nothing.
    const proof = await this.services.sourceVerifier.verify({
      agentId: current.agentId,
      database: current.database,
      dialect: current.dialect,
      email: input.email,
      password: input.password,
      clientToken: input.clientToken,
    });
    if (
      proof.database !== current.database ||
      proof.dialect !== current.dialect ||
      proof.identityHash !== current.identityHash
    ) {
      await this.owned(sessionId, personaId, (tx) =>
        this.source(tx, personaId, sourceId, input.expectedVersion),
      );
      await this.connections.invalidateIdentity(current);
      this.connections.discardSession(current.credentialId);
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Identidade da base mudou; vínculo suspenso. Cadastre uma nova fonte após revisão.",
      );
    }
    await guard?.beforeWrite();
    const updated = await this.owned(sessionId, personaId, async (tx) => {
      await guard?.commit(tx);
      const source = await this.source(tx, personaId, sourceId, input.expectedVersion);
      const next = {
        ...source,
        authorizationVersion: source.authorizationVersion + 1,
        credentialVersion: source.credentialVersion + 1,
        identityVerifiedAt: proof.verifiedAt,
      };
      await tx.updateSource(next, input.expectedVersion, {
        emailEnc: this.services.crypto.encrypt(input.email),
        passwordEnc: this.services.crypto.encrypt(input.password),
        clientTokenEnc: this.services.crypto.encrypt(input.clientToken),
      });
      await guard?.finish(tx);
      return next;
    });
    this.connections.discardSession(updated.credentialId);
    return updated;
  }

  private async source(
    tx: PersonaTransaction,
    personaId: string,
    sourceId: string,
    expectedVersion: number,
    allowInactive = false,
    allowReplaced = false,
  ) {
    const source = (await tx.listSources(personaId)).find((item) => item.id === sourceId);
    if (
      !source ||
      (!source.active && !allowInactive) ||
      (!allowReplaced && source.replacedBySourceId) ||
      !source.identityHash
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível nesta persona.");
    }
    this.assertVersion(source.authorizationVersion, expectedVersion);
    return source;
  }

  private assertVersion(current: number, expected: number) {
    if (current !== expected) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Cadastro mudou; recarregue antes de salvar.");
    }
  }

  private assertMetadata(input: unknown) {
    if (pareceSegredoEmTexto(JSON.stringify(input))) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Metadados contêm segredo; utilize os campos de credencial.",
      );
    }
  }
}
