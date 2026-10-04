import { bindFixtureParams } from "../src/application/use-cases/shared/bind-fixture-params.js";
import { parseConsultaSemantica } from "../src/domain/entities/consulta-semantica.js";
import { compilarConsultaSemantica } from "../src/application/use-cases/shared/compilar-consulta-semantica.js";
import { assertPrivacidadeAntesDoHub } from "../src/application/use-cases/shared/assert-privacidade.js";
import { inferirSensibilidadeColuna } from "../src/domain/entities/privacidade.js";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createDb } from "../src/infrastructure/persistence/drizzle/db.js";
import {
  DrizzleSkillRepository,
  DrizzleAcessoRepository,
} from "../src/infrastructure/persistence/drizzle/drizzle-cofre.js";
import { DrizzleTreinamentoRepository } from "../src/infrastructure/persistence/treinamento.js";
import {
  validarFixturesTipadas,
  casoArmazenado,
  compararResultados,
  hashTreino,
  skillTesteHash,
} from "../src/application/use-cases/shared/casos-treino.js";
import { validarSqlNoEscopo } from "../src/application/use-cases/shared/validar-escopo.js";
import { assertFanoutSeguro } from "../src/application/use-cases/shared/assert-fanout.js";
import { exigirFiltroEscopoPadrao } from "../src/application/use-cases/shared/escopo-filtro.js";
import { TREINAMENTO_BASE } from "../src/application/use-cases/shared/treinamento-base.js";
import { DomainError } from "../src/domain/errors/domain-error.js";
const option = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const url = process.env.DATABASE_URL,
  accessId = option("acesso"),
  skillId = option("skill");
if (
  process.env.TRAINING_EVAL_ENABLED !== "true" ||
  process.env.CI !== "true" ||
  !url ||
  !/^se7e_.*ci$/.test(new URL(url).pathname.slice(1)) ||
  !accessId
)
  throw new Error(
    "TRAINING_EVAL_ENABLED=true, CI=true, se7e_*ci database and --acesso required. Never use ERP/production databases.",
  );
const { db, pool } = createDb(url),
  repo = new DrizzleTreinamentoRepository(db),
  skills = new DrizzleSkillRepository(db),
  acessos = new DrizzleAcessoRepository(db);
const fixtures = new pg.Client({ connectionString: url });
await fixtures.connect();
const reports: unknown[] = [];
const evaluatorHash = hashTreino(readFileSync(new URL(import.meta.url), "utf8"));
try {
  const acesso = await acessos.findById(accessId);
  if (!acesso) throw new Error("Evaluation access missing");
  for (const doc of await repo.list(accessId, "caso", skillId)) {
    if (doc.conteudo.status !== "ativo" || !doc.skillId) continue;
    const skill = await skills.findById(doc.skillId);
    if (!skill) throw new Error("Evaluation skill missing");
    const test = casoArmazenado(doc.conteudo);
    if (!validarFixturesTipadas(test)) throw new Error("Synthetic fixture types mismatch");
    let status = "indisponivel",
      code: string | undefined;
    const started = Date.now();
    if (test.dialeto === "postgres" && acesso.dialeto === "postgres") {
      await fixtures.query("BEGIN");
      try {
        await fixtures.query("SET LOCAL statement_timeout='5s'");
        await fixtures.query("SET LOCAL search_path=pg_temp");
        for (const f of test.fixtures) {
          await fixtures.query(
            `CREATE TEMP TABLE "${f.tabela}" (${f.colunas.map((c) => `"${c.nome}" ${c.tipo}`).join(",")}) ON COMMIT DROP`,
          );
          for (const row of f.linhas)
            await fixtures.query(
              `INSERT INTO "${f.tabela}" VALUES (${row.map((_, i) => `$${i + 1}`).join(",")})`,
              row,
            );
        }
        const ir = parseConsultaSemantica(test.consultaSemantica);
        const sqlRef =
          test.sql ??
          (ir
            ? compilarConsultaSemantica(ir, skill.escopo, undefined, { dialeto: "postgres" }).sql
            : undefined);
        if (!sqlRef) {
          status = "indisponivel";
          code = "REFERENCIA_NAO_EXECUTAVEL";
        } else {
          let refusal: string | undefined;
          try {
            const ast = validarSqlNoEscopo(sqlRef, "postgres", skill.escopo);
            const fixtureNames = new Set(test.fixtures.map((f) => f.tabela.toLowerCase()));
            const assertFixture = (node: typeof ast): void => {
              for (const table of node.tabelas)
                if (
                  !table.isCte &&
                  !table.isSubquery &&
                  !fixtureNames.has(table.nome.toLowerCase())
                )
                  throw new Error("Physical reference outside temporary fixtures");
              for (const child of [...node.subqueries, ...node.setBranches]) assertFixture(child);
            };
            assertFixture(ast);
            assertFanoutSeguro(ast, skill.escopo);
            assertPrivacidadeAntesDoHub({
              ast,
              negar: ["pessoal", "segredo"],
              lookup: (_table, col) => inferirSensibilidadeColuna(col),
            });
            exigirFiltroEscopoPadrao({
              sql: sqlRef,
              dialeto: "postgres",
              escopoPadrao: acesso.escopoPadrao,
              colunasDasTabelas: skill.escopo.colunasPorTabela,
            });
          } catch (error) {
            if (error instanceof DomainError) refusal = error.code;
            else throw error;
          }
          if (refusal) {
            code = refusal;
            status =
              test.decisaoEsperada === "recusada" &&
              (!test.codigoEsperado || test.codigoEsperado === refusal)
                ? "aprovado"
                : "reprovado";
          } else if (test.decisaoEsperada !== "permitida") status = "reprovado";
          else {
            const params = {
              ...test.params,
              ...(acesso.escopoPadrao?.empresa ? { empresa: acesso.escopoPadrao.empresa } : {}),
              ...(acesso.escopoPadrao?.filial ? { filial: acesso.escopoPadrao.filial } : {}),
            };
            const bound = bindFixtureParams(sqlRef, params);
            const result = await fixtures.query(bound.sql, bound.values);
            status = compararResultados(result.rows, test.resultadoEsperado, test.comparacao)
              ? "aprovado"
              : "reprovado";
          }
        }
      } catch {
        status = "indisponivel";
        code = "AMBIENTE_OU_REFERENCIA_INDISPONIVEL";
      } finally {
        await fixtures.query("ROLLBACK");
      }
    } else code = "EXECUTOR_DIALETO_INDISPONIVEL";
    const report = await repo.append({
      id: randomUUID(),
      acessoId: accessId,
      skillId: skill.id,
      tipo: "relatorio",
      expectedVersion: 0,
      autorUsuarioId: null,
      conteudo: {
        formato: "se7e-evaluation/v1",
        casoId: doc.id,
        casoHash: hashTreino(doc.conteudo),
        skillHash: skillTesteHash(skill),
        skillVersao: skill.versao,
        baseHash: TREINAMENTO_BASE.hash,
        contratoHubRef: TREINAMENTO_BASE.contratoHubRef,
        evaluatorHash,
        evaluatorVersion: 1,
        status,
        code: code ?? null,
        motor: test.dialeto,
        duracaoMs: Date.now() - started,
        sintetico: true,
      },
    });
    reports.push(report);
    if (status !== "aprovado") process.exitCode = 1;
  }
  if (!reports.length) {
    process.exitCode = 1;
    throw new Error("No active synthetic cases to evaluate");
  }
  writeFileSync(
    option("output") ?? "skills-evaluation.json",
    JSON.stringify({ treinamentoBase: TREINAMENTO_BASE, reports }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ avaliados: reports.length, aprovado: !process.exitCode }));
} finally {
  await fixtures.end();
  await pool.end();
}
