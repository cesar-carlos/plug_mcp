import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import {
  aliasesMetricas,
  type ConsultaSemantica,
  type FiltroSemantico,
} from "../../../domain/entities/consulta-semantica.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import { NOMES_COLUNA_EMPRESA, NOMES_COLUNA_FILIAL } from "./escopo-filtro.js";
import { garantirLimiteInspecao } from "./expandir-star.js";

const lower = (value: string): string => value.trim().toLowerCase();

const colunaNoPacote = (escopo: EscopoSkill, coluna: string): boolean => {
  const wanted = lower(coluna);
  if (escopo.graoResultado.some((item) => lower(item) === wanted)) {
    return true;
  }
  for (const cols of Object.values(escopo.colunasPorTabela)) {
    if (cols.some((item) => item.toLowerCase() === wanted)) {
      return true;
    }
  }
  return false;
};

const unquoteIdent = (ident: string): string => ident.replace(/[[\]"`']/g, "").trim();

const tabelaDaColunaNoPacote = (escopo: EscopoSkill, coluna: string): string | null => {
  const wanted = lower(unquoteIdent(coluna));
  for (const [tabela, cols] of Object.entries(escopo.colunasPorTabela)) {
    if (cols.some((item) => item.toLowerCase() === wanted)) {
      return tabela;
    }
  }
  return null;
};

const tabelaDaColuna = (escopo: EscopoSkill, coluna: string): string | null =>
  tabelaDaColunaNoPacote(escopo, coluna) ?? escopo.tabelas[0] ?? null;

const QUALIFICADOR_COLUNA =
  /(?:\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_$#]*))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_$#]*))/g;

/** Alias do sqlModelo (`cr`, `[cr]`) vira o nome físico da coluna no pacote. Não inventa JOIN. */
const reescreverQualificadoresDaExpr = (escopo: EscopoSkill, expr: string): string =>
  expr.replace(
    QUALIFICADOR_COLUNA,
    (
      full,
      brTable: string | undefined,
      bareTable: string | undefined,
      brCol: string | undefined,
      bareCol: string | undefined,
    ) => {
      const qual = unquoteIdent(brTable ?? bareTable ?? "");
      const col = unquoteIdent(brCol ?? bareCol ?? "");
      if (!qual || !col) {
        return full;
      }
      const tabelaNoPacote = escopo.tabelas.find((nome) => lower(nome) === lower(qual));
      if (tabelaNoPacote) {
        return `${tabelaNoPacote}.${col}`;
      }
      const fisica = tabelaDaColunaNoPacote(escopo, col);
      return fisica ? `${fisica}.${col}` : full;
    },
  );

const tabelasDaExpr = (escopo: EscopoSkill, expr: string): string[] => {
  const found = new Set<string>();
  QUALIFICADOR_COLUNA.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUALIFICADOR_COLUNA.exec(expr)) !== null) {
    const tabela = unquoteIdent(match[1] ?? match[2] ?? "");
    if (!tabela) {
      continue;
    }
    const noPacote = escopo.tabelas.find((nome) => lower(nome) === lower(tabela));
    if (noPacote) {
      found.add(noPacote);
    }
  }
  return [...found];
};

const resolverMetrica = (escopo: EscopoSkill, alias: string) => {
  const wanted = lower(alias);
  const found = escopo.metricasSaida.find((item) => lower(item.alias) === wanted);
  if (!found) {
    throw DomainError.pacote({
      code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
      message: `Métrica ${alias} não está certificada no pacote.`,
      hint: "Use só aliases de metricasSaida da skill publicada.",
    });
  }
  return found;
};

const qualificarColuna = (escopo: EscopoSkill, coluna: string): string => {
  if (coluna.includes(".")) {
    return coluna;
  }
  const multi = escopo.tabelas.length > 1 || escopo.relacionamentos.length > 0;
  if (!multi) {
    return coluna;
  }
  const tabela = tabelaDaColuna(escopo, coluna);
  return tabela ? `${tabela}.${coluna}` : coluna;
};

const acharColuna = (escopo: EscopoSkill, candidatos: readonly string[]): string | null => {
  for (const cols of Object.values(escopo.colunasPorTabela)) {
    for (const col of cols) {
      if (candidatos.some((item) => item.toLowerCase() === col.toLowerCase())) {
        return col;
      }
    }
  }
  return null;
};

/** INNER é default; LEFT só se o pacote/treino gravou `tipoJoin` left. */
export const keywordJoinDoPacote = (tipoJoin: string | undefined): "LEFT JOIN" | "INNER JOIN" => {
  const tipo = (tipoJoin ?? "").trim().toLowerCase();
  return tipo.includes("left") ? "LEFT JOIN" : "INNER JOIN";
};

const caminhoJoins = (escopo: EscopoSkill, tabelas: readonly string[]): string[] => {
  if (tabelas.length <= 1) {
    return [];
  }
  const wanted = new Set(tabelas.map(lower));
  const clauses: string[] = [];
  const reached = new Set<string>([lower(tabelas[0] ?? "")]);
  let guard = 0;
  while (reached.size < wanted.size && guard < 16) {
    guard += 1;
    let progressed = false;
    for (const rel of escopo.relacionamentos) {
      const o = lower(rel.tabelaOrigem);
      const d = lower(rel.tabelaDestino);
      const pares = paresDoRelacionamento(rel);
      if (pares.length === 0) {
        continue;
      }
      const on = pares
        .map(
          (par) =>
            `${rel.tabelaOrigem}.${par.colunaOrigem} = ${rel.tabelaDestino}.${par.colunaDestino}`,
        )
        .join(" AND ");
      const joinKw = keywordJoinDoPacote(rel.tipoJoin);
      if (reached.has(o) && wanted.has(d) && !reached.has(d)) {
        clauses.push(`${joinKw} ${rel.tabelaDestino} ON ${on}`);
        reached.add(d);
        progressed = true;
      } else if (reached.has(d) && wanted.has(o) && !reached.has(o)) {
        clauses.push(`${joinKw} ${rel.tabelaOrigem} ON ${on}`);
        reached.add(o);
        progressed = true;
      }
    }
    if (!progressed) {
      break;
    }
  }
  if (reached.size < wanted.size) {
    throw DomainError.pacote({
      code: ERROR_CODES.JOIN_DESCONHECIDO,
      message: "Consulta semântica precisa de JOIN que não está no pacote.",
      hint: "Confirme o relacionamento composto com confirmar_relacionamento ou use SQL livre validado.",
    });
  }
  return clauses;
};

const sqlDoFiltro = (colQ: string, filtro: FiltroSemantico): string => {
  if (filtro.op === "is_null") {
    return `${colQ} IS NULL`;
  }
  if (filtro.op === "is_not_null") {
    return `${colQ} IS NOT NULL`;
  }
  if (filtro.op === "between") {
    return `${colQ} BETWEEN :${filtro.param ?? ""} AND :${filtro.param2 ?? ""}`;
  }
  if (filtro.op === "like") {
    return `${colQ} LIKE :${filtro.param ?? ""}`;
  }
  if (filtro.op === "in") {
    return `${colQ} IN (:${filtro.param ?? ""})`;
  }
  return `${colQ} ${filtro.op} :${filtro.param ?? ""}`;
};

export const compilarConsultaSemantica = (
  consulta: ConsultaSemantica,
  escopo: EscopoSkill,
  recorte?: { empresa?: boolean; filial?: boolean },
  opts?: { dialeto?: Dialeto; maxLimite?: number },
): { sql: string; elementos: string[] } => {
  const aliases = aliasesMetricas(consulta);
  const metricas = aliases.map((alias) => resolverMetrica(escopo, alias));
  const primeira = metricas[0];
  if (!primeira) {
    throw DomainError.pacote({
      code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
      message: "Consulta semântica exige ao menos uma métrica certificada.",
      hint: "Use aliases de metricasSaida da skill publicada.",
    });
  }
  const exprs = metricas.map((item) => ({
    alias: item.alias,
    expr: reescreverQualificadoresDaExpr(escopo, item.expr),
  }));
  const elementos = aliases.map((alias) => `metrica:${alias}`);
  const select: string[] = exprs.map((item) => `${item.expr} AS ${item.alias}`);
  const group: string[] = [];
  const restricoesDim = metricas
    .map((item) => item.dimensoesPermitidas ?? [])
    .filter((lista) => lista.length > 0)
    .map((lista) => new Set(lista.map(lower)));
  for (const dim of consulta.dimensoes ?? []) {
    if (!colunaNoPacote(escopo, dim)) {
      throw DomainError.pacote({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Dimensão ${dim} não está no pacote.`,
        hint: "Declare só colunas certificadas em graoResultado/colunasPorTabela.",
      });
    }
    if (restricoesDim.length > 0 && restricoesDim.some((ok) => !ok.has(lower(dim)))) {
      throw DomainError.pacote({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Dimensão ${dim} não é permitida para as métricas desta consulta.`,
        hint: "Use só dimensoesPermitidas do KPI no pacote.",
      });
    }
    const dimQ = qualificarColuna(escopo, dim);
    select.push(dimQ);
    group.push(dimQ);
    elementos.push(`dimensao:${dim}`);
  }
  const where: string[] = [];
  for (const filtro of consulta.filtros ?? []) {
    if (!colunaNoPacote(escopo, filtro.coluna)) {
      throw DomainError.pacote({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Filtro ${filtro.coluna} não está no pacote.`,
        hint: "Use colunas do dataset publicado.",
      });
    }
    const colQ = qualificarColuna(escopo, filtro.coluna);
    where.push(sqlDoFiltro(colQ, filtro));
    elementos.push(`filtro:${filtro.coluna}`);
  }
  const kpiStatus = metricas.find((item) => (item.statusIncluidos ?? []).length > 0);
  const statusIncluidos = kpiStatus?.statusIncluidos ?? [];
  if (
    statusIncluidos.length > 0 &&
    !consulta.filtros?.some((item) => /status/i.test(item.coluna))
  ) {
    const lista = statusIncluidos.map((item) => `'${item.replaceAll("'", "''")}'`).join(", ");
    const colStatus =
      Object.values(escopo.colunasPorTabela)
        .flat()
        .find((item) => /status/i.test(item)) ?? "Status";
    where.push(`${qualificarColuna(escopo, colStatus)} IN (${lista})`);
    elementos.push(`kpi-status:${colStatus}`);
  }
  const colunaDataKpi = metricas.find((item) => item.colunaData)?.colunaData;
  const colunaPeriodo = consulta.periodo?.coluna ?? colunaDataKpi;
  if (consulta.periodo) {
    if (!colunaNoPacote(escopo, consulta.periodo.coluna)) {
      throw DomainError.pacote({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Período ${consulta.periodo.coluna} não está no pacote.`,
        hint: "Use uma coluna de data certificada.",
      });
    }
    const colPeriodo = qualificarColuna(escopo, consulta.periodo.coluna);
    where.push(
      `${colPeriodo} >= :${consulta.periodo.de} AND ${colPeriodo} < :${consulta.periodo.ate}`,
    );
    elementos.push(`periodo:${consulta.periodo.coluna}`);
  } else if (colunaPeriodo && consulta.periodo === undefined && colunaDataKpi) {
    elementos.push(`kpi-data:${colunaDataKpi}`);
  }
  if (recorte?.empresa) {
    const col = acharColuna(escopo, NOMES_COLUNA_EMPRESA);
    if (col) {
      where.push(`${qualificarColuna(escopo, col)} = :empresa`);
      elementos.push("recorte:empresa");
    }
  }
  if (recorte?.filial) {
    const col = acharColuna(escopo, NOMES_COLUNA_FILIAL);
    if (col) {
      where.push(`${qualificarColuna(escopo, col)} = :filial`);
      elementos.push("recorte:filial");
    }
  }
  const aliasesLower = new Set(aliases.map(lower));
  const having: string[] = [];
  for (const item of consulta.having ?? []) {
    const metricaHaving = exprs.find((expr) => lower(expr.alias) === lower(item.metrica));
    if (!metricaHaving) {
      throw DomainError.pacote({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `HAVING ${item.metrica} não é métrica desta consulta.`,
        hint: "having[].metrica deve ser um alias de metricas[] / metrica desta IR.",
      });
    }
    having.push(`${metricaHaving.expr} ${item.op} :${item.param}`);
    elementos.push(`having:${item.metrica}`);
  }
  const order: string[] = [];
  for (const item of consulta.ordenacao ?? []) {
    if (!colunaNoPacote(escopo, item.coluna) && !aliasesLower.has(lower(item.coluna))) {
      throw DomainError.pacote({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Ordenação ${item.coluna} não está no pacote.`,
        hint: "Ordene só por dimensão ou métrica certificada.",
      });
    }
    const colOrder = aliasesLower.has(lower(item.coluna))
      ? item.coluna
      : qualificarColuna(escopo, item.coluna);
    order.push(`${colOrder} ${item.dir.toUpperCase()}`);
    elementos.push(`ordenacao:${item.coluna}`);
  }
  const tabelas: string[] = [];
  const addTabela = (nome: string | null): void => {
    if (nome && !tabelas.some((item) => lower(item) === lower(nome))) {
      tabelas.push(nome);
    }
  };
  for (const item of exprs) {
    for (const nome of tabelasDaExpr(escopo, item.expr)) {
      addTabela(nome);
    }
    addTabela(tabelaDaColuna(escopo, item.alias));
  }
  for (const dim of consulta.dimensoes ?? []) {
    addTabela(tabelaDaColuna(escopo, dim));
  }
  if (tabelas.length === 0) {
    addTabela(escopo.tabelas[0] ?? null);
  }
  if (tabelas.length === 0) {
    throw DomainError.pacote({
      code: ERROR_CODES.PACOTE_INCOMPLETO,
      message: "Pacote sem tabela para consulta semântica.",
      hint: "Publique a skill com sqlModelo e escopo.",
    });
  }
  const joins = caminhoJoins(escopo, tabelas);
  let sql = [
    `SELECT ${select.join(", ")}`,
    `FROM ${tabelas[0]}`,
    ...joins,
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    group.length > 0 ? `GROUP BY ${group.join(", ")}` : "",
    having.length > 0 ? `HAVING ${having.join(" AND ")}` : "",
    order.length > 0 ? `ORDER BY ${order.join(", ")}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  if (consulta.limite != null && opts?.dialeto) {
    const cap =
      opts.maxLimite != null ? Math.min(consulta.limite, opts.maxLimite) : consulta.limite;
    sql = garantirLimiteInspecao(sql, opts.dialeto, cap);
    elementos.push(`limite:${String(cap)}`);
  }
  return { sql, elementos };
};
