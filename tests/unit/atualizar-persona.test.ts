import { describe, expect, it } from "vitest";
import {
  AdicionarAcesso,
  AtualizarPersona,
  ListarAcessos,
  RegistrarAcesso,
  VerificarAcesso,
} from "../../src/application/use-cases/cofre.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import {
  INSTRUCOES_PERSONA_MAX_CHARS,
  NOME_PERSONA_MAX_CHARS,
} from "../../src/domain/entities/acesso.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { stubSessions } from "../helpers/stub-sessions.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

const seed = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const created = await new RegistrarAcesso(
    usuarios,
    acessos,
    plug,
    crypto,
    new SetupCodeStore(),
    "http://localhost",
    0,
  ).execute({
    email: "a@b.com",
    senha: "secret-pass",
    agentId,
    dialeto: "sybase",
    clientToken: "tok-sql-123456",
  });
  return { plug, acessos, created };
};

describe("atualizar_persona", () => {
  it("grava nome e instruções com confirmação e listar_acessos devolve sem secrets", async () => {
    const { acessos, created } = await seed();
    const result = await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Atendimento financeiro",
      instrucoesPersona: "Fale em tom formal. Não invente JOIN.",
      confirmadoPeloUsuario: true,
    });
    expect(result.acesso.nomePersona).toBe("Atendimento financeiro");
    expect(result.acesso.instrucoesPersona).toBe("Fale em tom formal. Não invente JOIN.");
    expect(JSON.stringify(result)).not.toMatch(/secret-pass/);
    expect(JSON.stringify(result)).not.toMatch(/tok-sql/);

    const listed = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(listed.acessos[0]?.nomePersona).toBe("Atendimento financeiro");
    expect(listed.acessos[0]?.instrucoesPersona).toBe("Fale em tom formal. Não invente JOIN.");
    expect(listed.acessos[0]?.clientTokenMasked).toBe("••••");
  });

  it("verificar_acesso inclui a persona", async () => {
    const { plug, acessos, created } = await seed();
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Vendedor",
      instrucoesPersona: "Priorize pedidos em aberto.",
      confirmadoPeloUsuario: true,
    });
    const result = await new VerificarAcesso(acessos, plug, stubSessions(), crypto).execute(
      created.usuarioId,
      { acessoId: created.acessoId },
    );
    expect(result.acesso.nomePersona).toBe("Vendedor");
    expect(result.acesso.instrucoesPersona).toBe("Priorize pedidos em aberto.");
  });

  it("recusa sem confirmadoPeloUsuario e recusa false", async () => {
    const { acessos, created } = await seed();
    await expect(
      new AtualizarPersona(acessos).execute(created.usuarioId, {
        acessoId: created.acessoId,
        nomePersona: "Vendedor",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      hint: expect.stringMatching(/confirmadoPeloUsuario/),
    });
    await expect(
      new AtualizarPersona(acessos).execute(created.usuarioId, {
        acessoId: created.acessoId,
        nomePersona: "Vendedor",
        confirmadoPeloUsuario: false,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      hint: expect.stringMatching(/confirmadoPeloUsuario/),
    });
  });

  it("recusa JWT e client_token no texto", async () => {
    const { acessos, created } = await seed();
    await expect(
      new AtualizarPersona(acessos).execute(created.usuarioId, {
        acessoId: created.acessoId,
        instrucoesPersona: "Use eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb",
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      new AtualizarPersona(acessos).execute(created.usuarioId, {
        acessoId: created.acessoId,
        instrucoesPersona: "client_token=abc12345secret",
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    const listed = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(listed.acessos[0]?.instrucoesPersona).toBeNull();
  });

  it("recusa teto de caracteres e patch mantém o outro campo", async () => {
    const { acessos, created } = await seed();
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Gestor",
      instrucoesPersona: "Foque em KPI do pacote.",
      confirmadoPeloUsuario: true,
    });
    await expect(
      new AtualizarPersona(acessos).execute(created.usuarioId, {
        acessoId: created.acessoId,
        nomePersona: "x".repeat(NOME_PERSONA_MAX_CHARS + 1),
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await expect(
      new AtualizarPersona(acessos).execute(created.usuarioId, {
        acessoId: created.acessoId,
        instrucoesPersona: "y".repeat(INSTRUCOES_PERSONA_MAX_CHARS + 1),
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Consultor",
      confirmadoPeloUsuario: true,
    });
    const listed = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(listed.acessos[0]?.nomePersona).toBe("Consultor");
    expect(listed.acessos[0]?.instrucoesPersona).toBe("Foque em KPI do pacote.");
  });

  it("string vazia ou null limpa o campo", async () => {
    const { acessos, created } = await seed();
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Vendedor",
      instrucoesPersona: "Tom direto.",
      confirmadoPeloUsuario: true,
    });
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "",
      instrucoesPersona: "  ",
      confirmadoPeloUsuario: true,
    });
    const listed = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(listed.acessos[0]?.nomePersona).toBeNull();
    expect(listed.acessos[0]?.instrucoesPersona).toBeNull();

    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Gestor",
      instrucoesPersona: "Foque em KPI do pacote.",
      confirmadoPeloUsuario: true,
    });
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: null,
      instrucoesPersona: null,
      confirmadoPeloUsuario: true,
    });
    const listedNull = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(listedNull.acessos[0]?.nomePersona).toBeNull();
    expect(listedNull.acessos[0]?.instrucoesPersona).toBeNull();
  });

  it("várias personas são vários acessos; listar_acessos devolve os dois chapéus", async () => {
    const { plug, acessos, created } = await seed();
    const agent2 = "22222222-2222-4222-8222-222222222222";
    plug.approve(agent2);
    const added = await new AdicionarAcesso(acessos, plug, stubSessions(), crypto).execute(
      created.usuarioId,
      {
        agentId: agent2,
        dialeto: "postgres",
        clientToken: "tok-sql-second1",
      },
    );
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nomePersona: "Vendedor",
      instrucoesPersona: "Priorize pedidos em aberto.",
      confirmadoPeloUsuario: true,
    });
    await new AtualizarPersona(acessos).execute(created.usuarioId, {
      acessoId: added.acesso.id,
      nomePersona: "Gestor",
      instrucoesPersona: "Foque em KPI do pacote.",
      confirmadoPeloUsuario: true,
    });
    const listed = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(listed.acessos).toHaveLength(2);
    const byId = new Map(listed.acessos.map((item) => [item.id, item]));
    expect(byId.get(created.acessoId)?.nomePersona).toBe("Vendedor");
    expect(byId.get(created.acessoId)?.instrucoesPersona).toBe("Priorize pedidos em aberto.");
    expect(byId.get(added.acesso.id)?.nomePersona).toBe("Gestor");
    expect(byId.get(added.acesso.id)?.instrucoesPersona).toBe("Foque em KPI do pacote.");
  });

  it("mesmo agentId em usuários MCP diferentes tem personas independentes", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    const primeiro = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-user-a1",
    });
    const segundo = await registrar.execute({
      email: "c@d.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-user-b1",
    });
    await new AtualizarPersona(acessos).execute(primeiro.usuarioId, {
      acessoId: primeiro.acessoId,
      nomePersona: "Vendedor",
      instrucoesPersona: "Tom direto.",
      confirmadoPeloUsuario: true,
    });
    await new AtualizarPersona(acessos).execute(segundo.usuarioId, {
      acessoId: segundo.acessoId,
      nomePersona: "Atendimento financeiro",
      instrucoesPersona: "Tom formal.",
      confirmadoPeloUsuario: true,
    });
    const listedA = await new ListarAcessos(acessos).execute(primeiro.usuarioId);
    const listedB = await new ListarAcessos(acessos).execute(segundo.usuarioId);
    expect(listedA.acessos).toHaveLength(1);
    expect(listedB.acessos).toHaveLength(1);
    expect(listedA.acessos[0]?.nomePersona).toBe("Vendedor");
    expect(listedA.acessos[0]?.instrucoesPersona).toBe("Tom direto.");
    expect(listedB.acessos[0]?.nomePersona).toBe("Atendimento financeiro");
    expect(listedB.acessos[0]?.instrucoesPersona).toBe("Tom formal.");
  });

  it("acessoId de outro usuário → ACESSO_NOT_FOUND", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    const dono = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-user-a1",
    });
    const outro = await registrar.execute({
      email: "c@d.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-user-b1",
    });
    await expect(
      new AtualizarPersona(acessos).execute(outro.usuarioId, {
        acessoId: dono.acessoId,
        nomePersona: "Invasor",
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.ACESSO_NOT_FOUND });
    const listedDono = await new ListarAcessos(acessos).execute(dono.usuarioId);
    expect(listedDono.acessos[0]?.nomePersona).toBeNull();
  });
});
