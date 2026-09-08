import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ListarAnotacoes } from "../../src/application/use-cases/skills.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "22222222-2222-4222-8222-222222222222";

describe("fila de revisão do conhecimento", () => {
  it("lista somente notas ativas cuja revisão ou vigência está na janela", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const acessos = new InMemoryAcessoRepository();
    const anotacoes = new InMemoryAnotacaoGrafoRepository();
    const criado = await new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "review@example.test",
      senha: "secret-pass",
      agentId,
      dialeto: "postgres",
      clientToken: "review-token",
    });
    await acessos.updateEscopoPadrao(criado.acessoId, null, "America/Cuiaba");
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Cuiaba",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await anotacoes.create({
      acessoId: criado.acessoId,
      tabelaId: null,
      tipo: "regra",
      titulo: "revisar agora",
      texto: "regra sintética sem dados de ERP",
      autorUsuarioId: criado.usuarioId,
      governanca: { responsavel: "time", revisarEm: hoje, periodoRevisaoDias: 30 },
    });
    await anotacoes.create({
      acessoId: criado.acessoId,
      tabelaId: null,
      tipo: "regra",
      titulo: "obsoleta",
      texto: "histórico",
      autorUsuarioId: criado.usuarioId,
      governanca: { status: "obsoleta", revisarEm: hoje },
    });

    const result = await new ListarAnotacoes(acessos, anotacoes).execute(criado.usuarioId, {
      acessoId: criado.acessoId,
      somenteRevisaoPendente: true,
      janelaRevisaoDias: 0,
    });

    expect(result.anotacoes).toHaveLength(1);
    expect(result.anotacoes[0]).toMatchObject({
      titulo: "revisar agora",
      ativaAgora: true,
      revisao: { proximaEm: hoje, pendente: true },
    });
  });
});
