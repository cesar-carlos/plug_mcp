import { z } from "zod";
import { createHash } from "node:crypto";
import type { Skill } from "../../../domain/entities/skill.js";
import type { DocumentoTreino } from "../../../domain/entities/treinamento.js";
import { conteudoSkillParaTeste } from "../../../domain/entities/treinamento.js";
import type { TreinamentoRepositoryPort } from "../../../domain/ports/treinamento-repository.port.js";
import { TREINAMENTO_BASE } from "./treinamento-base.js";
export const hashTreino = (value: unknown): string => {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, w]) => [k, canonical(w)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
};
const cell = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);
export const casoSchema = z.strictObject({
  pergunta: z.string().min(1).max(2000),
  finalidade: z.string().min(1).max(2000),
  dialeto: z.enum(["postgres", "mssql", "sybase", "firebird"]),
  sintetico: z.literal(true),
  obrigatorio: z.boolean().default(false),
  status: z.enum(["ativo", "arquivado"]).default("ativo"),
  fixtures: z
    .array(
      z.strictObject({
        tabela: z.string().regex(/^[a-zA-Z_][\w]*$/),
        colunas: z
          .array(
            z.strictObject({
              nome: z.string().regex(/^[a-zA-Z_][\w]*$/),
              tipo: z.enum(["text", "integer", "numeric", "boolean", "date", "timestamp"]),
            }),
          )
          .min(1)
          .max(50),
        linhas: z.array(z.array(cell)).max(500),
      }),
    )
    .max(10),
  sql: z.string().max(100000).optional(),
  consultaSemantica: z.record(z.string(), z.unknown()).optional(),
  params: z.record(z.string(), cell).default({}),
  decisaoEsperada: z.enum(["permitida", "recusada", "esclarecer", "lacuna"]),
  codigoEsperado: z.string().optional(),
  resultadoEsperado: z.array(z.record(z.string(), cell)).max(500).default([]),
  comparacao: z
    .strictObject({
      ordenado: z.boolean().default(true),
      decimais: z.array(z.string()).default([]),
    })
    .default({ ordenado: true, decimais: [] }),
});
export const validarFixturesTipadas = (caso: z.infer<typeof casoSchema>): boolean =>
  caso.fixtures.every((f) =>
    f.linhas.every(
      (row) =>
        row.length === f.colunas.length &&
        row.every((value, i) => {
          if (value === null) return true;
          const type = f.colunas[i]!.tipo;
          return type === "integer"
            ? typeof value === "number"
              ? Number.isSafeInteger(value)
              : typeof value === "string" && /^-?\d+$/.test(value)
            : type === "numeric"
              ? typeof value === "number"
                ? Number.isFinite(value)
                : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)
              : type === "boolean"
                ? typeof value === "boolean"
                : type === "text"
                  ? typeof value === "string"
                  : typeof value === "string" &&
                    Number.isFinite(Date.parse(value)) &&
                    (type !== "date" || /^\d{4}-\d{2}-\d{2}$/.test(value));
        }),
    ),
  );
export type CasoTreino = z.infer<typeof casoSchema>;
export const skillTesteHash = (skill: Skill): string => hashTreino(conteudoSkillParaTeste(skill));
export interface GateTestes {
  signature: string;
  liberado: boolean;
  aviso?: string;
  pendencias: { casoId: string; status: unknown }[];
}
export const gateTestes = async (
  repo: TreinamentoRepositoryPort,
  skill: Skill,
): Promise<GateTestes> => {
  const casos = (await repo.list(skill.acessoId!, "caso", skill.id)).filter(
    (c) => c.conteudo.status !== "arquivado",
  );
  const reports = await repo.list(skill.acessoId!, "relatorio", skill.id);
  const mandatory = casos.filter((c) => c.conteudo.obrigatorio === true);
  const evidence = mandatory.map((c) => ({
    c,
    r: reports
      .filter(
        (r) =>
          r.conteudo.casoId === c.id &&
          r.conteudo.casoHash === hashTreino(c.conteudo) &&
          r.conteudo.skillVersao === skill.versao &&
          c.conteudo.skillHash === skillTesteHash(skill) &&
          r.conteudo.skillHash === skillTesteHash(skill) &&
          r.conteudo.baseHash === TREINAMENTO_BASE.hash &&
          r.conteudo.contratoHubRef === TREINAMENTO_BASE.contratoHubRef,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  }));
  return {
    signature: hashTreino(
      evidence.map(({ c, r }) => [
        c.id,
        c.versao,
        hashTreino(c.conteudo),
        r?.id ?? null,
        r?.conteudo.status ?? null,
      ]),
    ),
    liberado: evidence.every(({ r }) => r?.conteudo.status === "aprovado"),
    aviso: casos.length ? undefined : "TESTES_AUSENTES",
    pendencias: evidence
      .filter(({ r }) => r?.conteudo.status !== "aprovado")
      .map(({ c, r }) => ({
        casoId: c.id,
        status: r?.conteudo.status ?? "TESTE_OBSOLETO_OU_NAO_EXECUTADO",
      })),
  };
};
const decimal = (value: unknown): string => {
  const s = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return s;
  const [a, b = ""] = s.split(".");
  const int = BigInt(a!).toString();
  const frac = b.replace(/0+$/, "");
  return frac ? `${int === "0" && s.startsWith("-") ? "-0" : int}.${frac}` : int;
};
export const compararResultados = (
  actual: readonly Record<string, unknown>[],
  expected: readonly Record<string, unknown>[],
  comparison: CasoTreino["comparacao"],
): boolean => {
  const normalize = (rows: readonly Record<string, unknown>[]) => {
    const encoded = rows.map((row) =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(row)
            .sort()
            .map((k) => [
              k,
              row[k] === null
                ? null
                : comparison.decimais.includes(k)
                  ? { decimal: decimal(row[k]) }
                  : row[k],
            ]),
        ),
      ),
    );
    return comparison.ordenado ? encoded : encoded.sort();
  };
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
};
export const ultimoDocumento = (
  rows: readonly DocumentoTreino[],
  id: string,
): DocumentoTreino | undefined => rows.find((r) => r.id === id);

export const casoArmazenado = (content: Readonly<Record<string, unknown>>): CasoTreino => {
  const { skillHash: _hash, skillVersao: _version, ...caso } = content;
  return casoSchema.parse(caso);
};
