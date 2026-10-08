import { describe, expect, it } from "vitest";
import { AtualizarEscopoPadrao } from "../../src/application/use-cases/aprendizado.js";
import {
  ListarAcessos,
  RegistrarAcesso,
  VerificarAcesso,
} from "../../src/application/use-cases/cofre.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { stubSessions } from "../helpers/stub-sessions.js";
import { withBound } from "../helpers/session-bound.js";

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

describe("sqlAccessState", () => {
  it("listar_acessos deriva só do cofre: approved → unknown/vault", async () => {
    const { acessos, created } = await seed();
    const result = await withBound(created.usuarioId, created.acessoId, () =>
      new ListarAcessos(acessos).execute(created.usuarioId),
    );
    expect(result.acessos[0]?.statusAcesso).toBe("approved");
    expect(result.acessos[0]?.sqlAccessState).toBe("unknown");
    expect(result.acessos[0]?.sqlAccessSource).toBe("vault");
    expect(result.acessos[0]?.nomePersona).toBeNull();
    expect(result.acessos[0]?.instrucoesPersona).toBeNull();
    expect(result.acessos[0]?.escopoPadrao).toBeNull();
    expect(result.acessos[0]?.timezone).toBeNull();
  });

  it("listar_acessos devolve o recorte vigente depois de gravar", async () => {
    const { acessos, created } = await seed();
    await new AtualizarEscopoPadrao(acessos).execute(created.usuarioId, {
      acessoId: created.acessoId,
      empresa: "1",
      filial: "2",
      timezone: "America/Cuiaba",
      bindings: [{ tabela: "Filial", coluna: "CodEmpresa", param: "empresa" }],
      confirmadoPeloUsuario: true,
    });
    const listed = await withBound(created.usuarioId, created.acessoId, () =>
      new ListarAcessos(acessos).execute(created.usuarioId),
    );
    expect(listed.acessos[0]?.timezone).toBe("America/Cuiaba");
    expect(listed.acessos[0]?.escopoPadrao).toEqual({
      empresa: "1",
      filial: "2",
      bindings: [{ tabela: "Filial", coluna: "CodEmpresa", param: "empresa" }],
    });
  });

  it("verificar_acesso com policy ok → active/policy", async () => {
    const { plug, acessos, created } = await seed();
    const result = await new VerificarAcesso(acessos, plug, stubSessions(), crypto).execute(
      created.usuarioId,
      { acessoId: created.acessoId },
    );
    expect(result.acesso.sqlAccessState).toBe("active");
    expect(result.acesso.sqlAccessSource).toBe("policy");
    expect(result.acesso.nomePersona).toBeNull();
  });

  it("verificar_acesso mapeia ACCESS_REVOKED da policy para revoked", async () => {
    const { plug, acessos, created } = await seed();
    plug.getClientTokenPolicy = async () => {
      throw new DomainError({
        code: ERROR_CODES.ACCESS_REVOKED,
        message: "token",
        hint: "x",
        source: "client_token_rpc",
        stage: "getPolicy",
      });
    };
    const result = await new VerificarAcesso(acessos, plug, stubSessions(), crypto).execute(
      created.usuarioId,
      { acessoId: created.acessoId },
    );
    expect(result.acesso.sqlAccessState).toBe("revoked");
    expect(result.acesso.sqlAccessSource).toBe("policy");
  });
});
