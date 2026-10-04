import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import {
  DrizzleAcessoRepository,
  DrizzleGrafoRepository,
  DrizzleSkillRepository,
  DrizzleAnotacaoGrafoRepository,
} from "./drizzle/drizzle-cofre.js";
import { capturarConhecimentoPublicavel } from "../../application/use-cases/shared/conhecimento-publicado.js";
import { parseSelect } from "../../application/use-cases/shared/sql-ast.js";
import { validarSqlNoEscopo } from "../../application/use-cases/shared/validar-escopo.js";
import { assertFanoutSeguro } from "../../application/use-cases/shared/assert-fanout.js";
import { exigirFiltroEscopoPadrao } from "../../application/use-cases/shared/escopo-filtro.js";
import { assertPrivacidadeAntesDoHub } from "../../application/use-cases/shared/assert-privacidade.js";
import { lookupSensibilidadeGrafo } from "../../application/use-cases/shared/mascarar-linhagem.js";
import { loadConfig } from "../../config/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(here, "../../../drizzle");

export const applyMigrations = async (input: {
  databaseUrl: string;
  through?: string;
}): Promise<void> => {
  const client = new pg.Client({ connectionString: input.databaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _mcp_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const files = readdirSync(drizzleDir)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) => input.through === undefined || name <= input.through)
      .sort();
    const applied = await client.query<{ filename: string }>(
      "SELECT filename FROM _mcp_migrations",
    );
    const done = new Set(applied.rows.map((row) => row.filename));
    for (const filename of files) {
      if (done.has(filename)) {
        console.log("skip", filename);
        continue;
      }
      const sql = readFileSync(path.join(drizzleDir, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        if (filename === "0028_publicacao_autoridade.sql") {
          await freezeAndValidateBaselines(client);
        }
        await client.query("INSERT INTO _mcp_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log("applied", filename);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("migration ok");
  } finally {
    await client.end();
  }
};

const freezeAndValidateBaselines = async (client: pg.Client): Promise<void> => {
  const db = drizzle(client, { schema });
  const skills = new DrizzleSkillRepository(db),
    grafo = new DrizzleGrafoRepository(db),
    anotacoes = new DrizzleAnotacaoGrafoRepository(db),
    acessos = new DrizzleAcessoRepository(db);
  const rows = await client.query<{
    id: string;
    acesso_id: string;
    publicacao_ativa_id: string;
    pacote: Record<string, unknown>;
  }>(
    "SELECT s.id,s.acesso_id,s.publicacao_ativa_id,p.pacote FROM skill s JOIN skill_publicacao p ON p.id=s.publicacao_ativa_id WHERE p.origem='migracao'",
  );
  for (const row of rows.rows) {
    const skill = await skills.findPublicadaById(row.id),
      acesso = await acessos.findById(row.acesso_id);
    if (!skill || !acesso) {
      throw new Error("Migration baseline is missing its access");
    }
    const conhecimentoPublicado = await capturarConhecimentoPublicavel(
      grafo,
      anotacoes,
      row.acesso_id,
      skill,
    );
    const pacote = JSON.stringify({ ...row.pacote, conhecimentoPublicado });
    await client.query("UPDATE skill_publicacao SET pacote=$1::jsonb,pacote_hash=$2 WHERE id=$3", [
      pacote,
      createHash("sha256").update(pacote).digest("hex"),
      row.publicacao_ativa_id,
    ]);
    try {
      const ast = parseSelect(skill.sqlModelo, acesso.dialeto);
      validarSqlNoEscopo(skill.sqlModelo, acesso.dialeto, skill.escopo);
      assertFanoutSeguro(ast, skill.escopo);
      exigirFiltroEscopoPadrao({
        sql: skill.sqlModelo,
        dialeto: acesso.dialeto,
        escopoPadrao: acesso.escopoPadrao,
        colunasDasTabelas: skill.escopo.colunasPorTabela,
      });
      const lookup = await lookupSensibilidadeGrafo(
        grafo,
        row.acesso_id,
        ast.tabelas.map((table) => table.nome),
      );
      assertPrivacidadeAntesDoHub({ ast, lookup, negar: ["pessoal", "segredo"] });
    } catch {
      await client.query(
        "UPDATE skill SET publicacao_ativa_id=NULL,status='rascunho_revalidacao',motivo_revalidacao='Baseline suspenso pelos bloqueios de segurança da migração' WHERE id=$1",
        [row.id],
      );
    }
  }
};

const run = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required to migrate");
  await applyMigrations({ databaseUrl: config.DATABASE_URL });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
