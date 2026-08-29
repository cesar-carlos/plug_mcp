import { describe, expect, it } from "vitest";
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
    const result = await new ListarAcessos(acessos).execute(created.usuarioId);
    expect(result.acessos[0]?.statusAcesso).toBe("approved");
    expect(result.acessos[0]?.sqlAccessState).toBe("unknown");
    expect(result.acessos[0]?.sqlAccessSource).toBe("vault");
  });

  it("verificar_acesso com policy ok → active/policy", async () => {
    const { plug, acessos, created } = await seed();
    const result = await new VerificarAcesso(acessos, plug, stubSessions(), crypto).execute(
      created.usuarioId,
      { acessoId: created.acessoId },
    );
    expect(result.acesso.sqlAccessState).toBe("active");
    expect(result.acesso.sqlAccessSource).toBe("policy");
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
