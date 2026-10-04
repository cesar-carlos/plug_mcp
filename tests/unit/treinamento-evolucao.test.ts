import { bindFixtureParams } from "../../src/application/use-cases/shared/bind-fixture-params.js";
import { compilarConsultaSemantica } from "../../src/application/use-cases/shared/compilar-consulta-semantica.js";
import { parseEscopoSkill, overlayMetricasSaida } from "../../src/domain/entities/escopo.js";
import {
  validarFixturesTipadas,
  casoSchema,
} from "../../src/application/use-cases/shared/casos-treino.js";
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  TREINAMENTO_BASE,
  obterTreinamentoBase,
  RESUMO_BASE,
} from "../../src/application/use-cases/shared/treinamento-base.js";
import { montarPreTreinoSessao } from "../../src/infrastructure/mcp/server-instructions.js";
import {
  compararResultados,
  gateTestes,
  hashTreino,
  skillTesteHash,
} from "../../src/application/use-cases/shared/casos-treino.js";
import { capturaSqlSegura } from "../../src/application/use-cases/shared/curadoria-segura.js";
import { identidadeConsulta } from "../../src/domain/entities/consulta-fingerprint.js";
import { Treinamento } from "../../src/application/use-cases/treinamento.js";
import { SalvarConsulta } from "../../src/application/use-cases/aprendizado.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import { MemoryTreinamentoRepository } from "../../src/infrastructure/persistence/treinamento.js";
import {
  InMemoryAcessoRepository,
  InMemoryUsuarioRepository,
  InMemorySkillRepository,
  InMemoryGrafoRepository,
  InMemoryAprendizadoRepository,
  InMemoryAuditLog,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";
import { sessionContext } from "../../src/application/session-context.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
const setup = async () => {
  const acessos = new InMemoryAcessoRepository(),
    skills = new InMemorySkillRepository(),
    graph = new InMemoryGrafoRepository(),
    learned = new InMemoryAprendizadoRepository(),
    repo = new MemoryTreinamentoRepository(),
    audit = new InMemoryAuditLog(),
    plug = new FakePlugServer();
  const agentId = randomUUID();
  plug.approve(agentId);
  const a = await new RegistrarAcesso(
    new InMemoryUsuarioRepository(),
    acessos,
    plug,
    new NodeCryptoAdapter("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
    new SetupCodeStore(),
    "http://localhost",
    0,
  ).execute({
    email: "synthetic@example.test",
    senha: "synthetic-only",
    clientToken: "synthetic",
    agentId,
    dialeto: "postgres",
  });
  const sql = "SELECT SUM(f.valor) AS total FROM fato f WHERE f.empresa=:empresa";
  const skill = await skills.create({
    acessoId: a.acessoId,
    slug: "fato",
    nome: "Fato",
    descricao: "Sintético",
    sqlModelo: sql,
    escopo: escopoFromSqlModelo(parseSqlModelo(sql)),
    autorUsuarioId: a.usuarioId,
  });
  await skills.setStatus(skill.id, "publicada");
  const service = new Treinamento(acessos, skills, graph, learned, repo, audit);
  const run = <T>(fn: () => Promise<T>) =>
    sessionContext.run({ usuarioId: a.usuarioId, acessoId: a.acessoId }, fn);
  return { a, acessos, skills, graph, learned, repo, audit, skill, sql, service, run };
};
const caso = {
  pergunta: "Somar valores sintéticos",
  finalidade: "Regressão de total",
  dialeto: "postgres",
  sintetico: true,
  obrigatorio: true,
  fixtures: [
    {
      tabela: "fato",
      colunas: [
        { nome: "empresa", tipo: "text" },
        { nome: "valor", tipo: "numeric" },
      ],
      linhas: [
        ["A", "10.01"],
        ["A", "10.01"],
      ],
    },
  ],
  sql: "SELECT SUM(f.valor) AS total FROM fato f WHERE f.empresa=:empresa",
  params: { empresa: "A" },
  decisaoEsperada: "permitida",
  resultadoEsperado: [{ total: "20.02" }],
  comparacao: { ordenado: true, decimais: ["total"] },
};
describe("evolução do treinamento", () => {
  it("base pública é igual em sessões e não assume dialeto", () => {
    const base = obterTreinamentoBase();
    expect(base).toMatchObject(TREINAMENTO_BASE);
    expect(base).not.toHaveProperty("guiaDialeto");
    expect(montarPreTreinoSessao([]).startsWith(RESUMO_BASE)).toBe(true);
    expect(obterTreinamentoBase({ dialeto: "firebird" })).toHaveProperty(
      "guiaDialeto.dialeto",
      "firebird",
    );
  });
  it("mantém precisão, tipos, nulos e ordem explicitamente", () => {
    const c = { ordenado: true, decimais: ["valor"] };
    expect(
      compararResultados(
        [{ id: "001", valor: "9007199254740993.0100", n: null }],
        [{ id: "001", valor: "9007199254740993.01", n: null }],
        c,
      ),
    ).toBe(true);
    expect(compararResultados([{ id: 1 }], [{ id: "1" }], c)).toBe(false);
    expect(compararResultados([{ valor: "1.004" }], [{ valor: "1.00" }], c)).toBe(false);
    expect(compararResultados([{ id: 2 }, { id: 1 }], [{ id: 1 }, { id: 2 }], c)).toBe(false);
    expect(
      compararResultados([{ id: 2 }, { id: 1 }], [{ id: 1 }, { id: 2 }], { ...c, ordenado: false }),
    ).toBe(true);
  });
  it("dedup considera contrato, publicação e literais", () => {
    const input = {
      sql: "SELECT f.id FROM fato f WHERE f.empresa=:empresa",
      paramsContrato: [],
      skillIds: ["s"],
      publicacoes: [{ skillId: "s", id: "p1", hash: "h1" }],
    };
    expect(identidadeConsulta({ ...input, sql: input.sql.replaceAll(" ", "  ") })).toBe(
      identidadeConsulta(input),
    );
    expect(
      identidadeConsulta({ ...input, publicacoes: [{ skillId: "s", id: "p2", hash: "h2" }] }),
    ).not.toBe(identidadeConsulta(input));
    expect(
      identidadeConsulta({
        ...input,
        paramsContrato: [
          { nome: "empresa", tipo: "integer", descricao: "Empresa", obrigatorio: true },
        ],
      }),
    ).not.toBe(identidadeConsulta(input));
  });
  it("captura bloqueia valores concretos e constantes não aprovadas", async () => {
    const { sql, skills, skill } = await setup();
    const published = (await skills.findPublicadaById(skill.id))!;
    expect(capturaSqlSegura(sql, "postgres", [published])).toBe(true);
    expect(capturaSqlSegura(sql.replace(":empresa", "'A'"), "postgres", [published])).toBe(false);
    expect(
      capturaSqlSegura("SELECT 'secret-data' FROM fato f WHERE f.empresa=:empresa", "postgres", [
        published,
      ]),
    ).toBe(false);
  });
  it("curadoria tem preview, CAS, replay recusado e não incrementa execução", async () => {
    const env = await setup();
    const approval = new SalvarConsulta(env.acessos, env.skills, env.learned, env.graph);
    const p = await approval.execute(env.a.usuarioId, {
      acessoId: env.a.acessoId,
      skillId: env.skill.id,
      pergunta: "Total sintético",
      sql: env.sql,
    });
    const done = await approval.execute(env.a.usuarioId, {
      acessoId: env.a.acessoId,
      consultaAprendidaId: p.consulta.id,
      confirmadoPeloUsuario: true,
      confirmacaoHash: p.confirmacaoHash,
    });
    expect(done.consulta.execucoes).toBe(0);
    expect(done.consulta.status).toBe("confirmada");
    await expect(
      approval.execute(env.a.usuarioId, {
        acessoId: env.a.acessoId,
        consultaAprendidaId: p.consulta.id,
        confirmadoPeloUsuario: true,
        confirmacaoHash: p.confirmacaoHash,
      }),
    ).rejects.toMatchObject({ code: "CONFIRMACAO_DESATUALIZADA" });
  });
  it("inativação preserva pergunta/autoria diante de nova execução", async () => {
    const env = await setup();
    const publication = (await env.skills.findPublicadaById(env.skill.id))!;
    const input = {
      acessoId: env.a.acessoId,
      skillIds: [env.skill.id],
      pergunta: "Pergunta aprovada",
      sql: env.sql,
      paramsContrato: [],
      autorUsuarioId: env.a.usuarioId,
      publicacoes: [
        {
          skillId: env.skill.id,
          id: publication.publicacaoAtivaId!,
          hash: publication.publicacaoHash!,
        },
      ],
    };
    const c = await env.learned.salvarConsulta({ ...input, status: "confirmada" });
    const preview = await env.run(() =>
      env.service.inativarConsulta(env.a.usuarioId, {
        consultaAprendidaId: c.id,
        motivo: "Referência incorreta",
      }),
    );
    await env.run(() =>
      env.service.inativarConsulta(env.a.usuarioId, {
        consultaAprendidaId: c.id,
        motivo: "Referência incorreta",
        confirmadoPeloUsuario: true,
        confirmacaoHash: String(preview.confirmacaoHash),
      }),
    );
    const repeated = await env.learned.salvarConsulta({
      ...input,
      pergunta: "Outra pergunta mais longa",
    });
    expect(repeated.status).toBe("inativa");
    expect(repeated.pergunta).toBe(input.pergunta);
  });
  it("casos são confirmados, CAS concorrente e gate exige relatório atual", async () => {
    const env = await setup();
    const p = await env.run(() =>
      env.service.salvarCaso(env.a.usuarioId, { skillId: env.skill.id, caso }),
    );
    expect(await env.repo.list(env.a.acessoId, "caso")).toHaveLength(0);
    const input = {
      skillId: env.skill.id,
      casoId: String(p.casoId),
      versao: 0,
      caso,
      confirmadoPeloUsuario: true,
      confirmacaoHash: String(p.confirmacaoHash),
    };
    const results = await Promise.allSettled([
      env.run(() => env.service.salvarCaso(env.a.usuarioId, input)),
      env.run(() => env.service.salvarCaso(env.a.usuarioId, input)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const draft = (await env.skills.findById(env.skill.id))!;
    expect((await gateTestes(env.repo, draft)).liberado).toBe(false);
    const doc = (await env.repo.list(env.a.acessoId, "caso"))[0]!;
    await env.repo.append({
      id: randomUUID(),
      acessoId: env.a.acessoId,
      skillId: draft.id,
      tipo: "relatorio",
      expectedVersion: 0,
      autorUsuarioId: null,
      conteudo: {
        casoId: doc.id,
        casoHash: hashTreino(doc.conteudo),
        skillHash: skillTesteHash(draft),
        skillVersao: draft.versao,
        baseHash: TREINAMENTO_BASE.hash,
        contratoHubRef: TREINAMENTO_BASE.contratoHubRef,
        status: "aprovado",
      },
    });
    expect((await gateTestes(env.repo, draft)).liberado).toBe(true);
    await env.skills.update(draft.id, { sqlModelo: env.sql + " AND f.valor>:minimo" });
    expect((await gateTestes(env.repo, (await env.skills.findById(draft.id))!)).liberado).toBe(
      false,
    );
  });
  it("feedback exige execução deste acesso e nunca altera publicação", async () => {
    const env = await setup();
    const event = await env.audit.append({
      usuarioId: env.a.usuarioId,
      acessoId: env.a.acessoId,
      tool: "consultar_dados",
      sucesso: true,
      sqlEnviado: null,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: 1,
      metadata: { publicacoes: [] },
    });
    await env.run(() =>
      env.service.feedback(env.a.usuarioId, {
        execucaoId: event.id,
        categoria: "semantica",
        correcao: "Rever tratamento de nulos",
      }),
    );
    expect(await env.repo.list(env.a.acessoId, "feedback")).toHaveLength(1);
    expect(await env.skills.findPublicadaById(env.skill.id)).not.toBeNull();
    await expect(
      env.run(() =>
        env.service.feedback(env.a.usuarioId, { execucaoId: randomUUID(), categoria: "resultado" }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("template sem valores cria rascunho sem publicação ou autorização herdada", async () => {
    const env = await setup();
    const p = await env.run(() =>
      env.service.exportarTemplate(env.a.usuarioId, { skillId: env.skill.id }),
    );
    const e = await env.run(() =>
      env.service.exportarTemplate(env.a.usuarioId, {
        skillId: env.skill.id,
        confirmadoPeloUsuario: true,
        confirmacaoHash: String(p.confirmacaoHash),
      }),
    );
    const template = z.record(z.string(), z.unknown()).parse(e.template);
    expect(template).not.toHaveProperty("acessoId");
    const preview = await env.run(() =>
      env.service.importarTemplate(env.a.usuarioId, { template, slug: "importada" }),
    );
    const imported = await env.run(() =>
      env.service.importarTemplate(env.a.usuarioId, {
        template,
        slug: "importada",
        confirmadoPeloUsuario: true,
        confirmacaoHash: String(preview.confirmacaoHash),
      }),
    );
    const id = z.object({ id: z.string() }).parse(imported.skill).id;
    expect(await env.skills.findPublicadaById(id)).toBeNull();
    await expect(
      env.run(() =>
        env.service.importarTemplate(env.a.usuarioId, {
          template: { ...template, dialeto: "mssql" },
          slug: "outro",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("constantes aprovadas têm vínculo físico e classe livre no AST PostgreSQL", async () => {
    const env = await setup(),
      pub = (await env.skills.findPublicadaById(env.skill.id))!;
    const column = {
      tabela: "fato",
      nome: "empresa",
      tipo: "text",
      nullable: false,
      papel: "codigo",
      dicionario: null,
      formato: null,
      descricao: null,
      perfil: null,
      sensibilidade: "livre",
      origem: "confirmado_usuario",
      status: "confirmado",
    };
    const skill = {
      ...pub,
      escopo: {
        ...pub.escopo,
        constantesNegocio: [{ tabela: "fato", coluna: "empresa", valor: "A" }],
      },
      conhecimentoPublicado: { colunas: [column], relacionamentos: [], regras: [], metricas: [] },
    };
    expect(capturaSqlSegura(env.sql.replace(":empresa", "'A'"), "postgres", [skill])).toBe(true);
    expect(
      capturaSqlSegura(
        env.sql.replace("fato f", "outro f").replace(":empresa", "'A'"),
        "postgres",
        [skill],
      ),
    ).toBe(false);
    expect(
      capturaSqlSegura(env.sql + " -- dados pessoais exemplo@example.test", "postgres", [skill]),
    ).toBe(false);
    expect(capturaSqlSegura(env.sql + " -- comentário não revisado", "postgres", [skill])).toBe(
      false,
    );
    expect(
      capturaSqlSegura(
        env.sql.replace("SUM(f.valor)", "ROUND(COALESCE(SUM(f.valor),0),2)") + " LIMIT 10",
        "postgres",
        [skill],
      ),
    ).toBe(true);
    expect(
      capturaSqlSegura(env.sql.replace(":empresa", "'A'"), "postgres", [
        {
          ...skill,
          conhecimentoPublicado: {
            ...skill.conhecimentoPublicado,
            colunas: [{ ...column, sensibilidade: "pessoal" }],
          },
        },
      ]),
    ).toBe(false);
  });
  it("semântica IR aplica nulos e ROUND sem converter unidade/calendar em SQL", () => {
    const scope = parseEscopoSkill({
      tabelas: ["fato"],
      colunasPorTabela: { fato: ["valor", "empresa"] },
      metricasSaida: [
        {
          alias: "total",
          expr: "SUM(fato.valor)",
          unidade: "BRL",
          moeda: "BRL",
          calendarioNegocio: "civil",
        },
      ],
    });
    const updated = overlayMetricasSaida(scope, [
      {
        alias: "total",
        tratamentoNulos: "zero",
        arredondamento: { casas: 3, modo: "round" },
        aditividade: "aditiva",
      },
    ]);
    const sql = compilarConsultaSemantica(
      { versao: 2, modo: "agregacao", metricas: ["total"] },
      updated,
      undefined,
      { dialeto: "postgres" },
    ).sql;
    expect(sql).toContain("ROUND(COALESCE(SUM(fato.valor), 0), 3)");
    expect(sql).not.toContain("BRL");
    expect(parseEscopoSkill(updated).metricasSaida[0]).toMatchObject({
      moeda: "BRL",
      arredondamento: { casas: 3, modo: "round" },
      tratamentoNulos: "zero",
    });
  });
  it("confirma grão em rascunho sem substituir publicação ativa", async () => {
    const env = await setup();
    const input = {
      skillId: env.skill.id,
      tabela: "fato",
      significado: "Uma linha sintética",
      chaves: ["empresa"],
      evidencia: "declaracao_usuario" as const,
    };
    const p = await env.run(() => env.service.confirmarGrao(env.a.usuarioId, input));
    await env.run(() =>
      env.service.confirmarGrao(env.a.usuarioId, {
        ...input,
        confirmadoPeloUsuario: true,
        confirmacaoHash: String(p.confirmacaoHash),
      }),
    );
    expect(
      (await env.skills.findById(env.skill.id))?.escopo.graosConfirmados?.fato?.chaves,
    ).toEqual(["empresa"]);
    expect(
      (await env.skills.findPublicadaById(env.skill.id))?.escopo.graosConfirmados?.fato,
    ).toBeUndefined();
  });
  it("fixtures exigem tipos, sem arredondar decimais longos", () => {
    expect(validarFixturesTipadas(casoSchema.parse(caso))).toBe(true);
    const invalid = casoSchema.parse({
      ...caso,
      fixtures: [
        { tabela: "fato", colunas: [{ nome: "id", tipo: "integer" }], linhas: [["texto"]] },
      ],
    });
    expect(validarFixturesTipadas(invalid)).toBe(false);
  });
  it("dataset confirma hash e mantém família na mesma partição", async () => {
    const env = await setup();
    const draft = (await env.skills.findById(env.skill.id))!;
    await env.repo.append({
      id: randomUUID(),
      acessoId: env.a.acessoId,
      skillId: draft.id,
      tipo: "caso",
      expectedVersion: 0,
      autorUsuarioId: env.a.usuarioId,
      conteudo: {
        ...caso,
        status: "ativo",
        skillHash: skillTesteHash(draft),
        skillVersao: draft.versao,
      },
    });
    const counts = [];
    for (const particao of ["treino", "desenvolvimento", "teste"] as const) {
      const p = await env.run(() => env.service.exportarDataset(env.a.usuarioId, { particao }));
      counts.push(p.quantidade);
      const exported = await env.run(() =>
        env.service.exportarDataset(env.a.usuarioId, {
          particao,
          confirmadoPeloUsuario: true,
          confirmacaoHash: String(p.confirmacaoHash),
        }),
      );
      expect(exported).toHaveProperty("manifest.hash");
    }
    expect(counts.filter((n) => n === 1)).toHaveLength(1);
    expect(counts.filter((n) => n === 0)).toHaveLength(2);
  });
  it("resumos não vazam SQL e tentativa com skill alheia não encontra casos", async () => {
    const env = await setup();
    await env.learned.salvarConsulta({
      acessoId: env.a.acessoId,
      skillIds: [env.skill.id],
      pergunta: "Total",
      sql: env.sql,
      paramsContrato: [],
      autorUsuarioId: env.a.usuarioId,
    });
    const listing = await env.run(() =>
      env.service.listarConsultas(env.a.usuarioId, { limite: 1 }),
    );
    expect(listing).toHaveProperty("total", 1);
    expect((listing.consultas as Record<string, unknown>[])[0]).not.toHaveProperty("sql");
    const other = await env.run(() =>
      env.service.casos(env.a.usuarioId, { skillId: randomUUID() }),
    );
    expect(other.casos).toEqual([]);
  });
  it("binding de fixture preserva literais/comentários/casts PostgreSQL", () => {
    const bound = bindFixtureParams(
      "SELECT ':empresa' literal, :valor::numeric total FROM fato WHERE empresa=:empresa -- :ignorar",
      { empresa: "A", valor: "10.01" },
    );
    expect(bound.sql).toBe(
      "SELECT ':empresa' literal, $1::numeric total FROM fato WHERE empresa=$2 -- :ignorar",
    );
    expect(bound.values).toEqual(["10.01", "A"]);
  });
});
