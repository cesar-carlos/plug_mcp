import pg from "pg";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";

const fields = [
  ["usuario_mcp", "email_enc"],
  ["usuario_mcp", "senha_enc"],
  ["acesso", "client_token_enc"],
  ["webhook_operacional", "url_enc"],
  ["webhook_operacional", "segredo_enc"],
] as const;

/** One transaction, row locks and compare-and-swap; plaintext never leaves memory. */
export const rotateEncryption = async (
  databaseUrl: string,
  crypto: CryptoPort,
  apply: boolean,
): Promise<{ checked: number; changed: number }> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let checked = 0,
    changed = 0;
  try {
    await client.query("BEGIN");
    for (const [table, column] of fields) {
      let after = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const rows = await client.query<{ id: string; payload: string }>(
          `SELECT id,${column} AS payload FROM ${table} WHERE id>$1::uuid ORDER BY id LIMIT 100 FOR UPDATE`,
          [after],
        );
        if (!rows.rowCount) {
          break;
        }
        for (const row of rows.rows) {
          const plain = crypto.decrypt(row.payload);
          const replacement = crypto.encrypt(plain);
          if (crypto.decrypt(replacement) !== plain) {
            throw new Error("Encryption roundtrip failed");
          }
          checked++;
          if (apply) {
            const result = await client.query(
              `UPDATE ${table} SET ${column}=$1 WHERE id=$2 AND ${column}=$3`,
              [replacement, row.id, row.payload],
            );
            if (result.rowCount !== 1) {
              throw new Error("Concurrent encryption change");
            }
            changed++;
          }
          after = row.id;
        }
      }
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { checked, changed };
  } catch {
    await client.query("ROLLBACK");
    throw new Error("Encryption rotation failed; transaction rolled back (no payload logged)");
  } finally {
    await client.end();
  }
};
