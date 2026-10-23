import { z } from "zod";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import type { KnowledgeLibraryVersion } from "../../domain/ports/knowledge-library.port.js";
import type {
  KnowledgeCatalog,
  SharedKnowledgeTransaction,
} from "../../domain/persona-v2/shared-knowledge.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  assertLibrarySize,
  candidateTemplate,
  decodeLibrary,
  libraryImportSchema,
  validateDataset,
  type LibraryPayload,
} from "./knowledge-library-schema.js";
import { importStructuralDdl } from "./structural-ddl.js";
export type LibraryAuthority = <T>(
  session: string,
  catalogId: string,
  action: (tx: SharedKnowledgeTransaction, owner: string, catalog: KnowledgeCatalog) => Promise<T>,
) => Promise<T>;
export type LibraryMetadata = Omit<KnowledgeLibraryVersion, "payloadEnc">;
export type LibraryItem = LibraryMetadata & { payload: LibraryPayload };
export function libraryMetadata(v: KnowledgeLibraryVersion): LibraryMetadata {
  const { payloadEnc: _cipher, ...meta } = v;
  return meta;
}
export class PersonaKnowledgeLibrary {
  constructor(
    private readonly s: PersonaServices,
    private readonly authorized: LibraryAuthority,
  ) {}
  importDdl(
    session: string,
    catalogId: string,
    raw: unknown,
  ): Promise<ReturnType<typeof importStructuralDdl>> {
    return this.authorized(session, catalogId, (tx, _owner, c) => {
      this.port(tx, c);
      return Promise.resolve(importStructuralDdl(raw, this.s.crypto));
    });
  }
  private port(tx: SharedKnowledgeTransaction, c: KnowledgeCatalog) {
    if (c.role === "reader" || !tx.library) {
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Biblioteca editorial exige papel de colaborador ou curador.",
      );
    }
    return tx.library;
  }
  list(
    session: string,
    catalogId: string,
    raw: unknown,
  ): Promise<{ items: LibraryMetadata[]; nextCursor: string | null }> {
    const { beforeId } = z.strictObject({ beforeId: z.uuid().optional() }).parse(raw);
    return this.authorized(session, catalogId, async (tx, _owner, c) => {
      const list = await this.port(tx, c).list(catalogId, beforeId);
      return {
        items: list.slice(0, 20).map(libraryMetadata),
        nextCursor: list.length > 20 ? list[19]!.id : null,
      };
    });
  }
  get(session: string, catalogId: string, id: string, raw: unknown): Promise<LibraryItem> {
    const { version } = z
      .strictObject({ version: z.coerce.number().int().positive().optional() })
      .parse(raw);
    return this.authorized(session, catalogId, async (tx, _owner, c) => {
      const v = await this.port(tx, c).get(catalogId, id, version);
      if (!v) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Material indisponível neste catálogo.");
      }
      return { ...libraryMetadata(v), payload: decodeLibrary(v, this.s.crypto) };
    });
  }
  save(session: string, catalogId: string, raw: unknown, id?: string): Promise<LibraryItem> {
    assertLibrarySize(raw);
    const input = libraryImportSchema
      .extend({ expectedVersion: z.number().int().min(0) })
      .parse(raw);
    return this.authorized(session, catalogId, async (tx, owner, c) => {
      const port = this.port(tx, c);
      const previous = id ? await port.get(catalogId, id) : null;
      if (
        (id && !previous) ||
        (previous &&
          (previous.version !== input.expectedVersion ||
            previous.kind !== input.payload.kind ||
            previous.slug !== input.slug)) ||
        (!id && input.expectedVersion !== 0)
      ) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Material mudou, ou versão/tipo/slug não corresponde.",
        );
      }
      const payload =
        input.payload.kind === "template"
          ? candidateTemplate(input.payload, this.s.crypto)
          : input.payload;
      if (payload.kind === "dataset") {
        const template = await port.get(catalogId, payload.templateId, payload.templateVersion);
        if (template?.kind !== "template" || template.hash !== payload.templateHash) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Versão do template não pertence ao catálogo ou mudou.",
          );
        }
        const decoded = decodeLibrary(template, this.s.crypto);
        if (decoded.kind !== "template") {
          throw new PersonaV2Error("INVALID_PLAN", "Referência não é template.");
        }
        validateDataset(payload, decoded);
      }
      const plain = canonicalJson(payload),
        v: KnowledgeLibraryVersion = {
          id: id ?? this.s.crypto.randomId(),
          catalogId,
          slug: input.slug,
          name: input.name,
          kind: payload.kind,
          version: input.expectedVersion + 1,
          hash: this.s.crypto.sha256Hex(plain),
          ownerId: owner,
          createdAt: this.s.now().toISOString(),
          payloadEnc: this.s.crypto.encrypt(plain),
          templateId: payload.kind === "dataset" ? payload.templateId : null,
          templateVersion: payload.kind === "dataset" ? payload.templateVersion : null,
        };
      await port.save(v, input.expectedVersion);
      await tx.audit(catalogId, owner, "biblioteca_versao_criada", v.id);
      return { ...libraryMetadata(v), payload };
    });
  }
}
