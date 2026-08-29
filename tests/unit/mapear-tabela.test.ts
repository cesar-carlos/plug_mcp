import { describe, expect, it } from "vitest";
import { MapearTabela } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryGrafoRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("mapear_tabela", () => {
  it("não grava explosão de tipos e infere papel/formato", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    plug.sqlImpl = async () => ({
      columns: ["column_name", "data_type", "is_nullable"],
      rows: [
        { column_name: "DtEmissao", data_type: "datetime", is_nullable: "YES" },
        { column_name: "DtEmissao", data_type: "geometry", is_nullable: "YES" },
        { column_name: "Valor", data_type: "numeric", is_nullable: "NO" },
      ],
    });
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
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
    const seeded = await grafo.mergeTabela({
      agentId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      tabelaId: seeded.tabela.id,
      nome: "Valor",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const mapear = new MapearTabela(acessos, grafo, plug, sessions, crypto);
    const result = await mapear.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabela: "ContaReceber",
    });
    expect(result.avisos.some((aviso) => aviso.code === "CATALOGO_TIPOS_AMBIGUOS")).toBe(true);
    expect(result.colunas).toHaveLength(2);
    const data = result.colunas.find((coluna) => coluna.nome === "DtEmissao");
    expect(data?.tipo).toBe("");
    expect(data?.papel).toBe("data");
    const valor = result.colunas.find((coluna) => coluna.nome === "Valor");
    expect(valor?.tipo).toBe("numeric");
    expect(valor?.formato).toBe("number");
    expect(valor?.papel).toBe("medida");
    const tabela = await grafo.findTabelaByNome(agentId, "ContaReceber");
    const cols = tabela ? await grafo.listColunas(tabela.id) : [];
    expect(cols).toHaveLength(2);
    expect(cols.find((coluna) => coluna.nome === "DtEmissao")?.tipo).toBeNull();
    expect(cols.find((coluna) => coluna.nome === "Valor")?.tipo).toBe("numeric");
    expect(cols.find((coluna) => coluna.nome === "Valor")?.formato).toBe("number");
    expect(cols.find((coluna) => coluna.nome === "Valor")?.origem).toBe("validado_execucao");
  });
});
