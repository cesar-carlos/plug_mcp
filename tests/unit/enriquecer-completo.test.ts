import { describe, expect, it } from "vitest";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("treinar_com_sql enriquecer=completo", () => {
  const setup = async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    const created = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const treinar = new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      new InMemorySkillRepository(),
    );
    return { plug, grafo, treinar, created };
  };

  it("grava cardinalidade e perfil sem desfazer o merge", async () => {
    const { plug, grafo, treinar, created } = await setup();
    plug.sqlImpl = async () => {
      const sql = plug.lastSql ?? "";
      if (/column_name/i.test(sql) || /syscolumns/i.test(sql)) {
        return {
          columns: ["column_name", "data_type", "is_nullable"],
          rows: [
            { column_name: "codprod", data_type: "int" },
            { column_name: "codcli", data_type: "int" },
            { column_name: "nome", data_type: "varchar" },
          ],
        };
      }
      if (/COUNT\s*\(\s*DISTINCT/i.test(sql) && !/MIN\(/i.test(sql)) {
        return { columns: ["total", "distintos"], rows: [{ total: 10, distintos: 10 }] };
      }
      if (/MIN\(/i.test(sql)) {
        return {
          columns: ["min_v", "max_v", "nulos", "total", "distintos"],
          rows: [{ min_v: 1, max_v: 9, nulos: 0, total: 10, distintos: 3 }],
        };
      }
      if (/SELECT DISTINCT/i.test(sql)) {
        return { columns: ["valor"], rows: [{ valor: "A" }, { valor: "B" }] };
      }
      return { columns: ["ok"], rows: [{ ok: 1 }] };
    };
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod AS codigo, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
      enriquecer: "completo",
    });
    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels.some((rel) => rel.cardinalidade === "1:1")).toBe(true);
    const produto = await grafo.findTabelaByNome(agentId, "produto");
    expect(produto).toBeTruthy();
    const cols = await grafo.listColunas(produto!.id);
    const codigo = cols.find((coluna) => coluna.nome.toLowerCase() === "codprod");
    expect(codigo?.perfil?.min).toBe(1);
    expect(codigo?.tipo).toBe("int");
    expect(codigo?.formato).toBe("number");
    expect(codigo?.perfil?.candidatosDicionario?.length).toBeGreaterThan(0);
  });

  it("falha de query de perfil vira aviso e mantém o grafo", async () => {
    const { plug, grafo, treinar, created } = await setup();
    plug.sqlImpl = async () => {
      const sql = plug.lastSql ?? "";
      if (/MIN\(/i.test(sql) || /COUNT\s*\(\s*DISTINCT/i.test(sql)) {
        throw new DomainError({
          code: ERROR_CODES.PLUG_SERVER_ERROR,
          message: "hub",
          hint: "retry",
        });
      }
      return { columns: ["ok"], rows: [{ ok: 1 }] };
    };
    const result = await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod AS codigo FROM produto p",
      enriquecer: "completo",
    });
    expect(result.avisos.some((aviso) => aviso.code === "PERFIL_QUERY_FALHOU")).toBe(true);
    const tabelas = await grafo.listTabelas(agentId);
    expect(tabelas.some((tabela) => tabela.nome.toLowerCase() === "produto")).toBe(true);
  });

  it("informa fase, orçamento e pendências ao atingir o teto", async () => {
    const { treinar, created } = await setup();
    const colunas = Array.from(
      { length: 17 },
      (_, index) => `p.col${String(index + 1)} AS col${String(index + 1)}`,
    ).join(", ");
    const result = await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: `SELECT ${colunas} FROM produto p`,
      enriquecer: "completo",
    });

    const teto = result.avisos.find((aviso) => aviso.code === "PERFIL_TETO");
    expect(teto?.details).toMatchObject({
      fase: "perfil",
      queriesUsadas: 16,
      queriesLimite: 16,
      retomavel: true,
    });
    expect(teto?.details?.pendencias.length).toBeGreaterThan(0);
  });

  it("retoma sem reconsultar JOIN já com cardinalidade", async () => {
    const { plug, treinar, created } = await setup();
    let countDistinct = 0;
    plug.sqlImpl = async () => {
      const sql = plug.lastSql ?? "";
      if (/column_name/i.test(sql) || /syscolumns/i.test(sql)) {
        return {
          columns: ["column_name", "data_type", "is_nullable"],
          rows: [
            { column_name: "codprod", data_type: "int" },
            { column_name: "codcli", data_type: "int" },
            { column_name: "nome", data_type: "varchar" },
          ],
        };
      }
      if (/COUNT\s*\(\s*DISTINCT/i.test(sql) && !/MIN\(/i.test(sql)) {
        countDistinct += 1;
        return { columns: ["total", "distintos"], rows: [{ total: 10, distintos: 10 }] };
      }
      if (/MIN\(/i.test(sql)) {
        return {
          columns: ["min_v", "max_v", "nulos", "total", "distintos"],
          rows: [{ min_v: 1, max_v: 9, nulos: 0, total: 10, distintos: 3 }],
        };
      }
      if (/SELECT DISTINCT/i.test(sql)) {
        return { columns: ["valor"], rows: [{ valor: "A" }, { valor: "B" }] };
      }
      return { columns: ["ok"], rows: [{ ok: 1 }] };
    };
    const sql =
      "SELECT p.codprod AS codigo, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli";
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql,
      enriquecer: "completo",
    });
    const primeiro = countDistinct;
    expect(primeiro).toBeGreaterThan(0);
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql,
      enriquecer: "completo",
    });
    expect(countDistinct).toBe(primeiro);
  });
});
