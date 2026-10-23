import { z } from "zod";
import { PersonaV2Error, type Source } from "./model.js";

export const sourceDiscoverySchema = z.strictObject({
  contractVersion: z.literal(1),
  database: z.string().min(1).max(500),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  identityHash: z.string().regex(/^[a-f0-9]{64}$/),
  identityKind: z.enum(["native", "provisioned", "locator"]),
  engineVersion: z.string().max(200),
  verifiedAt: z.iso.datetime({ offset: true }),
});
export type SourceDiscovery = z.infer<typeof sourceDiscoverySchema>;
const durableIdentity = (proof: SourceDiscovery): boolean =>
  proof.dialect === "sybase"
    ? proof.identityKind === "provisioned"
    : proof.identityKind === "native";
export const requireDurableSource = (
  raw: unknown,
  expected: { database: string; dialect: string },
): SourceDiscovery => {
  const proof = sourceDiscoverySchema.parse(raw);
  if (!durableIdentity(proof))
    throw new PersonaV2Error(
      "CAPABILITY_UNAVAILABLE",
      "O agente confirmou o motor, mas não forneceu identidade durável da base. Cadastro/execução recusados.",
    );
  if (proof.database !== expected.database || proof.dialect !== expected.dialect)
    throw new PersonaV2Error(
      "STALE_AUTHORIZATION",
      "Banco ou dialeto real diverge do cadastro. Revise a fonte; não adapte SQL para contornar esta verificação.",
    );
  return proof;
};
export const sourceIdentityMatches = (source: Source, proof: SourceDiscovery): boolean =>
  !!source.identityHash &&
  durableIdentity(proof) &&
  proof.database === source.database &&
  proof.dialect === source.dialect &&
  proof.identityHash === source.identityHash;

export interface ExpectedSource {
  readonly version: 1;
  readonly dialect: Source["dialect"];
  readonly identityHash: string;
}
export const expectedSourceFor = (source: Source): ExpectedSource => {
  if (!source.identityHash)
    throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Fonte sem identidade durável confirmada.");
  return { version: 1, dialect: source.dialect, identityHash: source.identityHash };
};
