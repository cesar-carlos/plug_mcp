import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { createDb } from "../../src/infrastructure/persistence/drizzle/db.js";
import {
  DrizzleSkillRepository,
  DrizzleAprendizadoRepository,
} from "../../src/infrastructure/persistence/drizzle/drizzle-cofre.js";
import { DrizzleSkillPublicacaoRepository } from "../../src/infrastructure/persistence/drizzle/drizzle-skill-publicacao.js";
import { DrizzleTreinamentoRepository } from "../../src/infrastructure/persistence/treinamento.js";
import { POLITICA_CONSULTA_DEFAULT } from "../../src/domain/entities/politica-consulta.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import {
  casoSchema,
  gateTestes,
  hashTreino,
  skillTesteHash,
} from "../../src/application/use-cases/shared/casos-treino.js";
import { TREINAMENTO_BASE } from "../../src/application/use-cases/shared/treinamento-base.js";
const url = process.env.DATABASE_URL;
const setup = async () => {
  const { db, pool } = createDb(url!),
    uid = randomUUID(),
    aid = randomUUID();
  await pool.query(
    "INSERT INTO usuario_mcp(id,email_enc,email_hash,senha_enc) VALUES($1,'enc',$2,'enc')",
    [uid, randomUUID()],
  );
  await pool.query(
    "INSERT INTO acesso(id,usuario_id,agent_id,dialeto,nome_amigavel,client_token_enc,client_token_hash,token_hash,status_acesso,escopo_padrao) VALUES($1,$2,$3,'postgres','synthetic','enc',$4,$5,'approved',$6)",
    [
      aid,
      uid,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      JSON.stringify({
        empresa: "A",
        bindings: [{ tabela: "fato", coluna: "empresa", param: "empresa" }],
      }),
    ],
  );
  const skills = new DrizzleSkillRepository(db),
    pubs = new DrizzleSkillPublicacaoRepository(db),
    learned = new DrizzleAprendizadoRepository(db),
    training = new DrizzleTreinamentoRepository(db);
  const scope = parseEscopoSkill({
    tabelas: ["fato"],
    colunasPorTabela: { fato: ["id", "empresa", "valor"] },
    metricasSaida: [{ alias: "total", expr: "SUM(f.valor)", definicao: "Total sintético" }],
  });
  const skill = await skills.create({
    acessoId: aid,
    slug: "synthetic",
    nome: "Synthetic",
    descricao: "Sintético",
    sqlModelo: "SELECT SUM(f.valor) total FROM fato f WHERE f.empresa=:empresa",
    escopo: scope,
    params: [{ nome: "empresa", descricao: "Recorte", tipo: "string", obrigatorio: true }],
    autorUsuarioId: uid,
  });
  await skills.setStatus(skill.id, "validada");
  const draft = (await skills.findById(skill.id))!;
  const publication = await pubs.publishAtomically({
    acessoId: aid,
    skillId: skill.id,
    expectedSkillVersion: draft.versao,
    expectedActiveId: null,
    expectedBaseHash: null,
    pacote: { ...draft },
    pacoteHash: randomUUID(),
    politicaConsulta: POLITICA_CONSULTA_DEFAULT,
    autorUsuarioId: uid,
  });
  const cleanup = async () => {
    await pool.query("DELETE FROM usuario_mcp WHERE id=$1", [uid]);
    await pool.end();
  };
  return { db, pool, uid, aid, skill, skills, pubs, learned, training, publication, cleanup };
};
describe.skipIf(!url)("PostgreSQL real: curadoria e testes de negócio", () => {
  it("captura concorrente deduplica; aprovação CAS não conta execução; inativação persiste", async () => {
    const e = await setup();
    try {
      const input = {
        acessoId: e.aid,
        skillIds: [e.skill.id],
        pergunta: "Total sintético",
        sql: e.skill.sqlModelo,
        paramsContrato: e.skill.params,
        autorUsuarioId: e.uid,
        publicacoes: [
          {
            skillId: e.skill.id,
            id: e.publication.publicacao.id,
            hash: e.publication.publicacao.pacoteHash,
          },
        ],
      };
      const captured = await Promise.all(
        Array.from({ length: 5 }, () => e.learned.salvarConsulta(input)),
      );
      expect(new Set(captured.map((c) => c.id)).size).toBe(1);
      const candidate = (await e.learned.obterConsulta(e.aid, captured[0]!.id))!;
      expect(candidate.execucoes).toBe(5);
      const confirmation = {
        acessoId: e.aid,
        id: candidate.id,
        expectedVersion: 1,
        status: "confirmada" as const,
        autorUsuarioId: e.uid,
        publicacoes: input.publicacoes,
      };
      const approvals = await Promise.allSettled([
        e.learned.alterarEstado(confirmation),
        e.learned.alterarEstado(confirmation),
      ]);
      expect(approvals.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await e.learned.obterConsulta(e.aid, candidate.id))?.execucoes).toBe(5);
      const confirmed = (await e.learned.obterConsulta(e.aid, candidate.id))!;
      await e.learned.alterarEstado({
        ...confirmation,
        expectedVersion: confirmed.versao!,
        status: "inativa",
        motivo: "Referência substituída",
      });
      const recaptured = await e.learned.salvarConsulta({
        ...input,
        pergunta: "Texto diferente que não substitui aprovação",
      });
      expect(recaptured.status).toBe("inativa");
      expect(recaptured.pergunta).toBe(input.pergunta);
      const page = await e.learned.paginarConsultas({
        acessoId: e.aid,
        estado: "inativa",
        pagina: 1,
        limite: 1,
      });
      expect(page.total).toBe(1);
      expect(await e.learned.obterConsulta(randomUUID(), candidate.id)).toBeNull();
    } finally {
      await e.cleanup();
    }
  });
  it("republicação entre preview e confirmação recusa candidata antiga sem promover", async () => {
    const e = await setup();
    try {
      const origins = [
        {
          skillId: e.skill.id,
          id: e.publication.publicacao.id,
          hash: e.publication.publicacao.pacoteHash,
        },
      ];
      const c = await e.learned.salvarConsulta({
        acessoId: e.aid,
        skillIds: [e.skill.id],
        pergunta: "Total",
        sql: e.skill.sqlModelo,
        paramsContrato: e.skill.params,
        publicacoes: origins,
        autorUsuarioId: e.uid,
      });
      await e.skills.update(e.skill.id, { descricao: "Revisão nova", status: "validada" });
      const draft = (await e.skills.findById(e.skill.id))!;
      await e.pubs.publishAtomically({
        acessoId: e.aid,
        skillId: e.skill.id,
        expectedSkillVersion: draft.versao,
        expectedActiveId: e.publication.publicacao.id,
        expectedBaseHash: e.publication.publicacao.pacoteHash,
        pacote: { ...draft },
        pacoteHash: randomUUID(),
        politicaConsulta: POLITICA_CONSULTA_DEFAULT,
        autorUsuarioId: e.uid,
      });
      await expect(
        e.learned.alterarEstado({
          acessoId: e.aid,
          id: c.id,
          expectedVersion: 1,
          status: "confirmada",
          autorUsuarioId: e.uid,
          publicacoes: origins,
        }),
      ).rejects.toMatchObject({ code: "CONFIRMACAO_DESATUALIZADA" });
      expect((await e.learned.obterConsulta(e.aid, c.id))?.status).toBe("candidata");
    } finally {
      await e.cleanup();
    }
  });
  it("casos têm CAS, revisões imutáveis e relatório obsoleto não aprova", async () => {
    const e = await setup();
    try {
      const s = (await e.skills.findById(e.skill.id))!;
      const input = {
        id: randomUUID(),
        acessoId: e.aid,
        skillId: s.id,
        tipo: "caso" as const,
        expectedVersion: 0,
        autorUsuarioId: e.uid,
        conteudo: {
          status: "ativo",
          obrigatorio: true,
          skillVersao: s.versao,
          skillHash: skillTesteHash(s),
        },
      };
      const writes = await Promise.allSettled([e.training.append(input), e.training.append(input)]);
      expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const doc = (await e.training.list(e.aid, "caso"))[0]!;
      await expect(
        e.pool.query("UPDATE treinamento_revisao SET conteudo='{}' WHERE id=$1", [doc.id]),
      ).rejects.toThrow();
      await e.training.append({
        id: randomUUID(),
        acessoId: e.aid,
        skillId: s.id,
        tipo: "relatorio",
        expectedVersion: 0,
        autorUsuarioId: null,
        conteudo: {
          casoId: doc.id,
          casoHash: hashTreino(doc.conteudo),
          skillHash: skillTesteHash(s),
          skillVersao: s.versao,
          baseHash: TREINAMENTO_BASE.hash,
          contratoHubRef: TREINAMENTO_BASE.contratoHubRef,
          status: "aprovado",
        },
      });
      expect((await gateTestes(e.training, s)).liberado).toBe(true);
      await e.training.append({
        ...input,
        expectedVersion: 1,
        conteudo: { ...doc.conteudo, finalidade: "Alterada" },
      });
      expect((await gateTestes(e.training, s)).liberado).toBe(false);
      expect(await e.skills.findPublicadaById(s.id)).not.toBeNull();
    } finally {
      await e.cleanup();
    }
  });
  it("runner CLI executa PostgreSQL, decimal exato e recusa adversarial, sem certificar outros motores", async () => {
    const e = await setup(),
      output = mkdtempSync(join(tmpdir(), "se7e-training-"));
    try {
      const s = (await e.skills.findById(e.skill.id))!;
      const positive = casoSchema.parse({
        pergunta: "Total",
        finalidade: "Valores iguais não são um só registro",
        dialeto: "postgres",
        sintetico: true,
        obrigatorio: true,
        fixtures: [
          {
            tabela: "fato",
            colunas: [
              { nome: "id", tipo: "integer" },
              { nome: "empresa", tipo: "text" },
              { nome: "valor", tipo: "numeric" },
            ],
            linhas: [
              [1, "A", "9007199254740993.01"],
              [2, "A", "9007199254740993.01"],
              [3, "B", "999.99"],
            ],
          },
        ],
        sql: s.sqlModelo,
        params: { empresa: "A" },
        decisaoEsperada: "permitida",
        resultadoEsperado: [{ total: "18014398509481986.02" }],
        comparacao: { ordenado: true, decimais: ["total"] },
      });
      for (const c of [
        positive,
        {
          ...positive,
          sql: "SELECT SUM(f.valor) total FROM fato f WHERE f.empresa=:empresa OR 1=1",
          decisaoEsperada: "recusada",
          codigoEsperado: "ESCOPO_FILTRO_AUSENTE",
        },
      ])
        await e.training.append({
          id: randomUUID(),
          acessoId: e.aid,
          skillId: s.id,
          tipo: "caso",
          expectedVersion: 0,
          autorUsuarioId: e.uid,
          conteudo: { ...c, skillVersao: s.versao, skillHash: skillTesteHash(s) },
        });
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/evaluate-skills.ts",
          `--acesso=${e.aid}`,
          `--output=${join(output, "report.json")}`,
        ],
        {
          env: { ...process.env, CI: "true", TRAINING_EVAL_ENABLED: "true", DATABASE_URL: url! },
          timeout: 20000,
          stdio: "pipe",
        },
      );
      const reports = await e.training.list(e.aid, "relatorio");
      expect(reports).toHaveLength(2);
      expect(reports.every((r) => r.conteudo.status === "aprovado")).toBe(true);
      expect((await gateTestes(e.training, s)).liberado).toBe(true);
      expect(
        await e.pool.query("SELECT to_regclass('public.fato') name").then((r) => r.rows[0].name),
      ).toBeNull();
    } finally {
      rmSync(output, { recursive: true, force: true });
      await e.cleanup();
    }
  });
});
