import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import pg from "pg";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { rotateEncryption } from "../../src/infrastructure/persistence/rotate-encryption.js";
const database = process.env.DATABASE_URL;
describe.skipIf(!database)("PostgreSQL real: recriptografia transacional", () => {
  it("ensaia sem alterar, aplica todas as colunas e reverte integralmente a falha", async () => {
    const client = new pg.Client({ connectionString: database });
    await client.connect();
    const schema = "se7e_rotation_ci_" + randomUUID().replaceAll("-", "");
    const url = new URL(database!);
    url.searchParams.set("options", "-c search_path=" + schema);
    const old = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      next = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const a = new NodeCryptoAdapter(old, "old"),
      b = new NodeCryptoAdapter(next, "new", { old });
    try {
      await client.query("CREATE SCHEMA " + schema);
      await client.query("SET search_path=" + schema);
      await client.query(
        "CREATE TABLE usuario_mcp(id uuid PRIMARY KEY,email_enc text,senha_enc text)",
      );
      await client.query("CREATE TABLE acesso(id uuid PRIMARY KEY,client_token_enc text)");
      await client.query(
        "CREATE TABLE webhook_operacional(id uuid PRIMARY KEY,url_enc text,segredo_enc text)",
      );
      await client.query("INSERT INTO usuario_mcp VALUES($1,$2,$3)", [
        randomUUID(),
        a.encrypt("synthetic-email"),
        a.encrypt("synthetic-password"),
      ]);
      await client.query("INSERT INTO acesso VALUES($1,$2)", [
        randomUUID(),
        a.encrypt("synthetic-client"),
      ]);
      await client.query("INSERT INTO webhook_operacional VALUES($1,$2,$3)", [
        randomUUID(),
        a.encrypt("https://synthetic.example.test"),
        a.encrypt("synthetic-hmac"),
      ]);
      const before = await client.query<{ email_enc: string }>("SELECT email_enc FROM usuario_mcp");
      expect(await rotateEncryption(url.toString(), b, false)).toEqual({ checked: 5, changed: 0 });
      expect((await client.query("SELECT email_enc FROM usuario_mcp")).rows).toEqual(before.rows);
      expect(await rotateEncryption(url.toString(), b, true)).toEqual({ checked: 5, changed: 5 });
      const applied = await client.query<{ email_enc: string }>(
        "SELECT email_enc FROM usuario_mcp",
      );
      expect(applied.rows[0]!.email_enc).toMatch(/^v2.new./);
      expect(b.decrypt(applied.rows[0]!.email_enc)).toBe("synthetic-email");
      await client.query("UPDATE webhook_operacional SET segredo_enc='invalid-synthetic-payload'");
      await expect(rotateEncryption(url.toString(), b, true)).rejects.toThrow(
        "transaction rolled back",
      );
      expect((await client.query("SELECT email_enc FROM usuario_mcp")).rows).toEqual(applied.rows);
    } finally {
      await client.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
      await client.end();
    }
  });
});
