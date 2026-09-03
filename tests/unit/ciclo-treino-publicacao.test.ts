import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ListarConflitos } from "../../src/application/use-cases/consultar.js";
import {
  ConfirmarRelacionamento,
  CriarSkill,
  ListarSkills,
  PublicarSkill,
  RemoverRelacionamento,
  ValidarSkill,
} from "../../src/application/use-cases/skills.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { seedTabelaComColunas } from "../helpers/seed-grafo.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

const seed = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const skills = new InMemorySkillRepository();
  const grafo = new InMemoryGrafoRepository();
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
    dialeto: "mssql",
    clientToken: "tok-sql-123456",
  });
  const sessions = {
    getAccessToken: async () => "access-test",
    invalidate: () => undefined,
    remember: () => undefined,
  };
  await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
    usuarioId: created.usuarioId,
    nome: "ContaReceber",
    colunas: ["CodEmpresa", "CodFilial", "Valor"],
  });
  await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
    usuarioId: created.usuarioId,
    nome: "Filial",
    colunas: ["CodEmpresa", "CodFilial"],
  });
  return { plug, acessos, skills, grafo, created, sessions };
};

describe("ciclo de treino e publicação", () => {
  it("skill validada com JOIN sem cardinalidade aponta confirmar_relacionamento", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    const origem = await grafo.findTabelaByNome(created.acessoId, "Filial");
    const destino = await grafo.findTabelaByNome(created.acessoId, "ContaReceber");
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: origem!.id,
      tabelaDestinoId: destino!.id,
      pares: [
        { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
        { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
      ],
      tipoJoin: "inner",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const sql =
      "SELECT r.Valor AS total FROM ContaReceber r INNER JOIN Filial f ON f.CodEmpresa = r.CodEmpresa AND f.CodFilial = r.CodFilial WHERE r.Valor > 0";
    const createdSkill = await new CriarSkill(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Receber",
      descricao: "Títulos a receber",
      sqlModelo: sql,
    });
    await new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo).execute(
      created.usuarioId,
      { acessoId: created.acessoId, skillId: createdSkill.skill.id },
    );
    const listed = await new ListarSkills(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    const item = listed.skills[0];
    expect(item?.status).toBe("validada");
    expect(item?.podeLiberar).toBe(false);
    expect(item?.fluxoTreino.passoAtual).toBe("publicar_skill");
    expect(item?.fluxoTreino.passoAtual).not.toBe("treinar_sql");
    expect(item?.fluxoTreino.proximoPasso).toBe("confirmar_relacionamento");
    expect(item?.faltas.some((falta) => falta.nextAction === "confirmar_relacionamento")).toBe(
      true,
    );
  });

  it("confirmar composto remove pares isolados; remover_relacionamento apaga só o fingerprint", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const origem = await grafo.findTabelaByNome(created.acessoId, "Filial");
    const destino = await grafo.findTabelaByNome(created.acessoId, "ContaReceber");
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: origem!.id,
      tabelaDestinoId: destino!.id,
      pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
      tipoJoin: "inner",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: origem!.id,
      tabelaDestinoId: destino!.id,
      pares: [{ colunaOrigem: "CodFilial", colunaDestino: "CodFilial" }],
      tipoJoin: "inner",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: origem!.id,
      tabelaDestinoId: destino!.id,
      pares: [
        { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
        { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
      ],
      tipoJoin: "inner",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const sql =
      "SELECT r.Valor AS total FROM ContaReceber r INNER JOIN Filial f ON f.CodEmpresa = r.CodEmpresa AND f.CodFilial = r.CodFilial WHERE r.Valor > 0";
    const createdSkill = await new CriarSkill(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Receber",
      descricao: "Títulos",
      sqlModelo: sql,
    });
    const confirmar = new ConfirmarRelacionamento(acessos, grafo, skills);
    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      colunaOrigem: "CodEmpresa",
      colunaDestino: "CodEmpresa",
    });
    await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      colunaOrigem: "CodFilial",
      colunaDestino: "CodFilial",
    });
    const composed = await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      pares: [
        { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
        { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
      ],
      cardinalidade: "1:1",
    });
    expect(composed.skill?.escopo.relacionamentos).toHaveLength(1);
    expect(composed.skill?.escopo.relacionamentos[0]?.pares).toHaveLength(2);
    const grafoRels = await grafo.listRelacionamentos(created.acessoId);
    expect(grafoRels).toHaveLength(1);
    expect(grafoRels[0]?.pares).toHaveLength(2);

    const remover = new RemoverRelacionamento(acessos, grafo, skills);
    await expect(
      remover.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: createdSkill.skill.id,
        tabelaOrigem: "Filial",
        tabelaDestino: "ContaReceber",
        pares: [
          { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
          { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
        ],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    const removed = await remover.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      pares: [
        { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
        { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
      ],
      confirmadoPeloUsuario: true,
    });
    expect(removed.skill?.escopo.relacionamentos).toHaveLength(0);
    expect(await grafo.listRelacionamentos(created.acessoId)).toHaveLength(0);
  });

  it("listar_conflitos devolve colunaId usável", async () => {
    const { acessos, grafo, created } = await seed();
    const tabela = await grafo.findTabelaByNome(created.acessoId, "ContaReceber");
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: tabela!.id,
      nome: "Historico",
      descricao: "saldo",
      origem: "confirmado_usuario",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: tabela!.id,
      nome: "Historico",
      descricao: "outro significado",
      origem: "confirmado_usuario",
      autorUsuarioId: created.usuarioId,
    });
    const listed = await new ListarConflitos(acessos, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(listed.conflitos.some((item) => item.kind === "coluna" && item.colunaId)).toBe(true);
  });

  it("publicar_skill sem confirmação não grava publicada", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const criar = new CriarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    await new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo).execute(
      created.usuarioId,
      { acessoId: created.acessoId, skillId: createdSkill.skill.id },
    );
    const preview = await new PublicarSkill(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    expect(preview.publicado).toBe(false);
    expect(preview.resumoPublicacao.nome).toBe("Produtos");
    expect(preview.resumoPublicacao.hintPolitica).toMatch(/atualizar_skill\.politicaConsulta/);
    expect(preview.resumoPublicacao.politicaConsultaDefault.maxRows).toBe(500);
    const published = await new PublicarSkill(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      confirmadoPeloUsuario: true,
    });
    expect(published.publicado).toBe(true);
    expect(published.skill.politicaConsulta).toMatchObject({
      maxRows: 500,
      timeoutMs: 30_000,
    });
  });
});
