import type pg from "pg";
import type { VaultRotationCipher } from "../../../domain/ports/persona-vault-rotation.port.js";

export async function assertPersonaVaultKeyring(
  db: Pick<pg.Client, "query">,
  cipher: VaultRotationCipher,
  keyId: string,
): Promise<void> {
  const result = await db.query<{ matches: boolean }>(
    "SELECT persona_vault_keyring_matches_v2($1,$2) AS matches",
    [keyId, JSON.stringify(cipher.keyFingerprints())],
  );
  if (!result.rows[0]?.matches)
    throw new Error("Persona vault keyring differs from active rotation");
}
