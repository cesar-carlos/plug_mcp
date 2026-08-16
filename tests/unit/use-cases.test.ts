import { describe, expect, it } from "vitest";
import { ConectarAmbiente } from "../../src/application/use-cases/conectar-ambiente.js";
import { ConsultarDados } from "../../src/application/use-cases/consultar-dados.js";
import { ObterFonte } from "../../src/application/use-cases/obter-fonte.js";
import { ConfigurarClientToken } from "../../src/application/use-cases/configurar-client-token.js";
import { VerificarStatusAmbiente } from "../../src/application/use-cases/verificar-status-ambiente.js";
import { ListarAmbientes } from "../../src/application/use-cases/listar-ambientes.js";
import { ListarFontes } from "../../src/application/use-cases/listar-fontes.js";
import { DesconectarAmbiente } from "../../src/application/use-cases/desconectar-ambiente.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import type { LoggerPort } from "../../src/domain/ports/logger.port.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  InMemoryAmbienteRepository,
  InMemoryAnotacaoRepository,
  InMemoryAuditLog,
  InMemoryCatalogoRepository,
} from "../../src/infrastructure/persistence/memory/memory-repos.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const AGENT = "3183a9f2-429b-46d6-a339-3580e5e5cb31";
const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);

const setup = async () => {
  const ambientes = new InMemoryAmbienteRepository();
  const catalogo = new InMemoryCatalogoRepository();
  await catalogo.seedIfEmpty();
  const plug = new FakePlugServer();
  const audit = new InMemoryAuditLog();
  return { ambientes, catalogo, plug, audit };
};

describe("use cases", () => {
  it("conectar_ambiente valida uuid e dialeto", async () => {
    const { ambientes, plug } = await setup();
    const uc = new ConectarAmbiente(ambientes, plug);
    await expect(
      uc.execute(ACCOUNT, { agentId: "nope", dialeto: "mssql", nomeAmigavel: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      uc.execute(ACCOUNT, { agentId: AGENT, dialeto: "oracle", nomeAmigavel: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("conectar_ambiente cria pending e solicita acesso", async () => {
    const { ambientes, plug } = await setup();
    const result = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "firebird",
      nomeAmigavel: "Loja 1",
    });
    expect(result.ambiente.dialeto).toBe("firebird");
    expect(result.ambiente.statusAcesso).toBe("pending");
    expect(plug.pending.has(AGENT)).toBe(true);
  });

  it("verificar_status pending devolve AGENT_ACCESS_PENDING", async () => {
    const { ambientes, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    await expect(
      new VerificarStatusAmbiente(ambientes, plug).execute(ACCOUNT, created.ambiente.id),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("obter_fonte resolve SQL Firebird", async () => {
    const { ambientes, catalogo, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "firebird",
      nomeAmigavel: "A",
    });
    const detalhe = await new ObterFonte(
      ambientes,
      catalogo,
      new InMemoryAnotacaoRepository(),
    ).execute(ACCOUNT, {
      ambienteId: created.ambiente.id,
      fonteId: "vendas",
    });
    expect(detalhe.sqlBase).toContain("VENDA");
    expect(detalhe.dialeto).toBe("firebird");
    expect(detalhe.orientacoesIa.some((o) => o.includes("FIRST"))).toBe(true);
    expect(detalhe.regras[0]).toMatchObject({ nome: "Faturamento" });
    expect(detalhe.sinonimos.some((s) => s.termo === "faturamento")).toBe(true);
  });

  it("listar_fontes devolve slugs", async () => {
    const { ambientes, catalogo, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "postgres",
      nomeAmigavel: "A",
    });
    const list = await new ListarFontes(ambientes, catalogo).execute(ACCOUNT, created.ambiente.id);
    expect(list.fontes.map((f) => f.id).sort()).toEqual(["clientes", "produtos", "vendas"]);
  });

  it("listar_fontes retorna AMBIENTE_NOT_FOUND quando o id não existe", async () => {
    const { ambientes, catalogo } = await setup();
    await expect(
      new ListarFontes(ambientes, catalogo).execute(
        ACCOUNT,
        "11111111-1111-4111-8111-111111111112",
      ),
    ).rejects.toMatchObject({ code: "AMBIENTE_NOT_FOUND" });
  });

  it("consultar_dados exige sql", async () => {
    const { ambientes, plug, audit } = await setup();
    plug.approve(AGENT);
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
      ambienteId: created.ambiente.id,
      clientToken: "tok-erp-1",
    });
    await expect(
      new ConsultarDados(ambientes, plug, crypto, audit, 500, 1_000_000).execute(ACCOUNT, {
        ambienteId: created.ambiente.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("consultar_dados marca truncated e audita", async () => {
    const { ambientes, plug, audit } = await setup();
    plug.approve(AGENT);
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
      ambienteId: created.ambiente.id,
      clientToken: "tok-erp-1",
    });
    plug.sqlImpl = async () => ({
      columns: ["id"],
      rows: Array.from({ length: 500 }, (_, i) => ({ id: i })),
    });
    const result = await new ConsultarDados(ambientes, plug, crypto, audit, 500, 1_000_000).execute(
      ACCOUNT,
      {
        ambienteId: created.ambiente.id,
        sql: "SELECT id FROM (SELECT 1 AS id) t",
      },
    );
    expect(result.truncated).toBe(true);
    expect(result.hint).toContain("incompleto");
    expect(audit.rows[0]?.sucesso).toBe(true);
    expect(plug.tokens.get(AGENT)).toBe("tok-erp-1");
  });

  it("listar_ambientes exige conta autenticada", async () => {
    const { ambientes } = await setup();
    await expect(new ListarAmbientes(ambientes).execute(undefined)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("listar_ambientes devolve ambientes públicos da conta", async () => {
    const { ambientes, plug } = await setup();
    await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "Loja 1",
    });
    const result = await new ListarAmbientes(ambientes).execute(ACCOUNT);
    expect(result.ambientes).toHaveLength(1);
    expect(result.ambientes[0]).toMatchObject({ nomeAmigavel: "Loja 1", hasClientToken: false });
  });

  it("configurar_client_token rejeita token acima de 512 caracteres", async () => {
    const { ambientes, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    await expect(
      new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
        ambienteId: created.ambiente.id,
        clientToken: "x".repeat(513),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("configurar_client_token rejeita ambienteId inexistente", async () => {
    const { ambientes, plug } = await setup();
    await expect(
      new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
        ambienteId: "11111111-1111-4111-8111-111111111112",
        clientToken: "tok",
      }),
    ).rejects.toMatchObject({ code: "AMBIENTE_NOT_FOUND" });
  });

  it("obter_fonte retorna FONTE_NOT_FOUND para slug inexistente", async () => {
    const { ambientes, catalogo, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    await expect(
      new ObterFonte(ambientes, catalogo, new InMemoryAnotacaoRepository()).execute(ACCOUNT, {
        ambienteId: created.ambiente.id,
        fonteId: "inexistente",
      }),
    ).rejects.toMatchObject({ code: "FONTE_NOT_FOUND" });
  });

  it("obter_fonte retorna DIALECT_VARIANT_MISSING quando falta variante SQL", async () => {
    const { ambientes, catalogo, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "postgres",
      nomeAmigavel: "A",
    });
    const vendas = catalogo.fontes.find((f) => f.slug === "vendas");
    catalogo.variants = catalogo.variants.filter(
      (v) => !(v.fonteId === vendas?.id && v.dialeto === "postgres"),
    );
    await expect(
      new ObterFonte(ambientes, catalogo, new InMemoryAnotacaoRepository()).execute(ACCOUNT, {
        ambienteId: created.ambiente.id,
        fonteId: "vendas",
      }),
    ).rejects.toMatchObject({ code: "DIALECT_VARIANT_MISSING" });
  });

  it("verificar_status_ambiente aprova e confirma client_token", async () => {
    const { ambientes, plug } = await setup();
    plug.approve(AGENT);
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    await new ConfigurarClientToken(ambientes, plug, crypto).execute(ACCOUNT, {
      ambienteId: created.ambiente.id,
      clientToken: "tok-erp-1",
    });
    const result = await new VerificarStatusAmbiente(ambientes, plug).execute(
      ACCOUNT,
      created.ambiente.id,
    );
    expect(result.ambiente.statusAcesso).toBe("approved");
    expect(result.plugServer.hasClientToken).toBe(true);
    expect(result.plugServer.state).toBe("approved");
    expect(result.proximoPasso).toContain("listar_fontes");
  });

  it("desconectar_ambiente remove o ambiente mesmo se o hub falhar ao limpar o token", async () => {
    const { ambientes, plug, audit } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    plug.putClientToken = async () => {
      throw new DomainError({
        code: "PLUG_SERVER_ERROR",
        message: "hub down",
        hint: "retry",
      });
    };
    const logger: LoggerPort = {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => logger,
    };
    const result = await new DesconectarAmbiente(ambientes, plug, audit, logger).execute(
      ACCOUNT,
      created.ambiente.id,
    );
    expect(result.desconectado).toBe(true);
    expect(await ambientes.findByIdForAccount(created.ambiente.id, ACCOUNT)).toBeNull();
    expect(audit.rows.some((row) => row.tool === "desconectar_ambiente")).toBe(true);
  });

  it("desconectar_ambiente exige ambienteId válido", async () => {
    const { ambientes, plug, audit } = await setup();
    const logger: LoggerPort = {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => logger,
    };
    await expect(
      new DesconectarAmbiente(ambientes, plug, audit, logger).execute(ACCOUNT, undefined),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("verificar_status_ambiente marca revoked quando o hub rejeitou o pedido", async () => {
    const { ambientes, plug } = await setup();
    const created = await new ConectarAmbiente(ambientes, plug).execute(ACCOUNT, {
      agentId: AGENT,
      dialeto: "mssql",
      nomeAmigavel: "A",
    });
    plug.reject(AGENT);
    await expect(
      new VerificarStatusAmbiente(ambientes, plug).execute(ACCOUNT, created.ambiente.id),
    ).rejects.toMatchObject({ code: "ACCESS_REVOKED" });
    const local = await ambientes.findByIdForAccount(created.ambiente.id, ACCOUNT);
    expect(local?.statusAcesso).toBe("revoked");
  });
});
