import { describe, expect, it } from "vitest";
import {
  ListarAuditoria,
  ListarLacunas,
  ListarMetricasAgente,
  RegistrarLacunaFerramenta,
} from "../../src/application/use-cases/aprendizado.js";
import { formatarTagsTelemetriaBusca } from "../../src/application/use-cases/shared/telemetria-busca.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAprendizadoRepository,
  InMemoryAuditLog,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("métricas e lacunas de ferramenta", () => {
  const setup = async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const aprendizado = new InMemoryAprendizadoRepository();
    const audit = new InMemoryAuditLog();
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
    return { acessos, aprendizado, audit, created };
  };

  it("agrega auditoria por tool e código", async () => {
    const { acessos, audit, created } = await setup();
    await audit.append({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      tool: "consultar_dados",
      sqlEnviado: null,
      sucesso: false,
      codigoErro: "INVALID_SQL",
      linhasRetornadas: 0,
      duracaoMs: 12,
    });
    await audit.append({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      tool: "consultar_dados",
      sqlEnviado: null,
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 3,
      duracaoMs: 8,
    });
    const result = await new ListarMetricasAgente(acessos, audit).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(result.porTool.consultar_dados?.total).toBe(2);
    expect(result.porTool.consultar_dados?.erros).toBe(1);
    expect(result.porCodigo.INVALID_SQL).toBe(1);
    expect(result.busca).toEqual({
      total: 0,
      consultaPermitida: 0,
      skillGap: 0,
      skillNotPublished: 0,
      slotNarrativa: 0,
    });
  });

  it("registra e lista lacuna de ferramenta", async () => {
    const { acessos, aprendizado, created } = await setup();
    const registrar = new RegistrarLacunaFerramenta(acessos, aprendizado);
    const createdLacuna = await registrar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      objetivo: "listar gráficos certificados da skill",
      entradas: "skillId",
      saidas: "spec vega-lite",
      permissao: "leitura",
      teto: "sem ERP",
      aceite: "resource skill:// inclui chartSpec",
    });
    const lista = await new ListarLacunas(acessos, aprendizado).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(lista.lacunas[0]?.id).toBe(createdLacuna.lacunaId);
    expect(lista.lacunas[0]?.tipo).toBe("ferramenta");
    expect(lista.lacunas[0]?.status).toBe("aberta");
    expect(lista.lacunas[0]?.contrato).toMatchObject({ entradas: "skillId" });
  });

  it("mesmo objetivo de ferramenta não cria linha nova", async () => {
    const { acessos, aprendizado, created } = await setup();
    const registrar = new RegistrarLacunaFerramenta(acessos, aprendizado);
    const input = {
      acessoId: created.acessoId,
      objetivo: "listar gráficos certificados da skill",
    };
    const first = await registrar.execute(created.usuarioId, input);
    const second = await registrar.execute(created.usuarioId, input);
    expect(second.lacunaId).toBe(first.lacunaId);
    const lista = await new ListarLacunas(acessos, aprendizado).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(lista.lacunas).toHaveLength(1);
  });

  it("listar_auditoria expõe telemetria só em buscar_contexto", async () => {
    const { acessos, audit, created } = await setup();
    await audit.append({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      tool: "consultar_dados",
      sqlEnviado: "SELECT 1",
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: 4,
    });
    await audit.append({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      tool: "buscar_contexto",
      sqlEnviado: formatarTagsTelemetriaBusca({
        conhecimentos: 2,
        slotNarrativa: true,
        cobertura: "completa",
        consultaPermitida: true,
        gap: "none",
        listarSkills: false,
      }),
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 2,
      duracaoMs: 9,
    });
    const auditoria = await new ListarAuditoria(acessos, audit).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    const consulta = auditoria.entradas.find((item) => item.tool === "consultar_dados");
    const busca = auditoria.entradas.find((item) => item.tool === "buscar_contexto");
    expect(consulta).not.toHaveProperty("telemetria");
    expect(busca?.telemetria).toEqual({
      conhecimentos: 2,
      slotNarrativa: true,
      cobertura: "completa",
      consultaPermitida: true,
      gap: "none",
      listarSkills: false,
    });
    const metricas = await new ListarMetricasAgente(acessos, audit).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(metricas.busca).toEqual({
      total: 1,
      consultaPermitida: 1,
      skillGap: 0,
      skillNotPublished: 0,
      slotNarrativa: 1,
    });
  });
});
