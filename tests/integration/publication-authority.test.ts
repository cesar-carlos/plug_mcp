import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDb } from "../../src/infrastructure/persistence/drizzle/db.js";
import {
  DrizzleSkillRepository,
  DrizzleAcessoRepository,
} from "../../src/infrastructure/persistence/drizzle/drizzle-cofre.js";
import { DrizzleSkillPublicacaoRepository } from "../../src/infrastructure/persistence/drizzle/drizzle-skill-publicacao.js";
import { POLITICA_CONSULTA_DEFAULT } from "../../src/domain/entities/politica-consulta.js";
import { escopoVazio } from "../../src/domain/entities/escopo.js";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("PostgreSQL real: autoridade publicada", () => {
  it("publicação concorrente troca o ponteiro uma vez e edição mantém snapshot", async () => {
    const { db, pool } = createDb(url!);
    const uid = randomUUID(),
      aid = randomUUID();
    try {
      await pool.query(
        "INSERT INTO usuario_mcp(id,email_enc,email_hash,senha_enc) VALUES($1,'enc',$2,'enc')",
        [uid, randomUUID()],
      );
      await pool.query(
        "INSERT INTO acesso(id,usuario_id,agent_id,dialeto,nome_amigavel,client_token_enc,client_token_hash,token_hash,status_acesso) VALUES($1,$2,$3,'postgres','ci','enc',$4,$5,'approved')",
        [aid, uid, randomUUID(), randomUUID(), randomUUID()],
      );
      const skills = new DrizzleSkillRepository(db),
        publications = new DrizzleSkillPublicacaoRepository(db);
      const draft = await skills.create({
        acessoId: aid,
        slug: "ci",
        nome: "CI",
        descricao: "original",
        sqlModelo: "SELECT SUM(1) total",
        autorUsuarioId: uid,
      });
      await skills.setStatus(draft.id, "validada");
      const pacote = {
        slug: "ci",
        nome: "CI",
        descricao: "original",
        sqlModelo: draft.sqlModelo,
        params: [],
        escopo: escopoVazio(),
        pacoteVersao: 2,
      };
      const input = {
        acessoId: aid,
        skillId: draft.id,
        expectedSkillVersion: draft.versao,
        expectedActiveId: null,
        expectedBaseHash: null,
        pacote,
        pacoteHash: "approved-hash",
        politicaConsulta: POLITICA_CONSULTA_DEFAULT,
        autorUsuarioId: uid,
      };
      const results = await Promise.allSettled([
        publications.publishAtomically(input),
        publications.publishAtomically(input),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r) => r.status === "rejected");
      expect(failed?.status === "rejected" && failed.reason).toMatchObject({
        code: "CONFIRMACAO_DESATUALIZADA",
      });
      const before = await skills.findPublicadaById(draft.id);
      await skills.update(draft.id, { descricao: "editada", sqlModelo: "SELECT SUM(2) total" });
      expect((await skills.findPublicadaById(draft.id))?.sqlModelo).toBe(draft.sqlModelo);
      expect((await skills.findById(draft.id))?.sqlModelo).toBe("SELECT SUM(2) total");
      expect((await skills.findPublicadaById(draft.id))?.publicacaoAtivaId).toBe(
        before?.publicacaoAtivaId,
      );
      await expect(
        pool.query("UPDATE skill_publicacao SET pacote='{}' WHERE skill_id=$1", [draft.id]),
      ).rejects.toThrow();
      await skills.suspenderPublicacao(draft.id);
      expect(await skills.findPublicadaById(draft.id)).toBeNull();
      const acessos = new DrizzleAcessoRepository(db);
      const expected = (await acessos.findById(aid))!.tokenHash;
      const rotations = await Promise.all([
        acessos.compareAndRotateToken(aid, expected, "rotation-a", null),
        acessos.compareAndRotateToken(aid, expected, "rotation-b", null),
      ]);
      expect(rotations.filter(Boolean)).toHaveLength(1);
    } finally {
      await pool.query("DELETE FROM usuario_mcp WHERE id=$1", [uid]);
      await pool.end();
    }
  });
});
