import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import type { ConsultaSemantica } from "../../../domain/entities/consulta-semantica.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import { NOMES_COLUNA_EMPRESA, NOMES_COLUNA_FILIAL } from "./escopo-filtro.js";

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

const tabelaDaColuna = (escopo: EscopoSkill, coluna: string): string | null => {
  const wanted = lower(coluna);
  for (const [tabela, cols] of Object.entries(escopo.colunasPorTabela)) {
    if (cols.some((item) => item.toLowerCase() === wanted)) {
      return tabela;
    }
  }
  return escopo.tabelas[0] ?? null;
};

const tabelasDaExpr = (escopo: EscopoSkill, expr: string): string[] => {
  const found = new Set<string>();
  const re = /([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr)) !== null) {
    const tabela = match[1] ?? "";
    if (escopo.tabelas.some((nome) => lower(nome) === lower(tabela))) {
      found.add(escopo.tabelas.find((nome) => lower(nome) === lower(tabela)) ?? tabela);
    }
  }
  return [...found];
};

const resolverMetrica = (escopo: EscopoSkill, alias: string) => {
  const wanted = lower(alias);
  const found = escopo.metricasSaida.find((item) => lower(item.alias) === wanted);
  if (!found) {
    throw new DomainError({
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
      if (reached.has(o) && wanted.has(d) && !reached.has(d)) {
        clauses.push(`INNER JOIN ${rel.tabelaDestino} ON ${on}`);
        reached.add(d);
        progressed = true;
      } else if (reached.has(d) && wanted.has(o) && !reached.has(o)) {
        clauses.push(`INNER JOIN ${rel.tabelaOrigem} ON ${on}`);
        reached.add(o);
        progressed = true;
      }
    }
    if (!progressed) {
      break;
    }
  }
  if (reached.size < wanted.size) {
    throw new DomainError({
      code: ERROR_CODES.JOIN_DESCONHECIDO,
      message: "Consulta semântica precisa de JOIN que não está no pacote.",
      hint: "Confirme o relacionamento composto com confirmar_relacionamento ou use SQL livre validado.",
    });
  }
  return clauses;
};

export const compilarConsultaSemantica = (
  consulta: ConsultaSemantica,
  escopo: EscopoSkill,
  recorte?: { empresa?: boolean; filial?: boolean },
): { sql: string; elementos: string[] } => {
  const metrica = resolverMetrica(escopo, consulta.metrica);
  const elementos = [`metrica:${consulta.metrica}`];
  const select: string[] = [`${metrica.expr} AS ${metrica.alias}`];
  const group: string[] = [];
  const dimensoesOk = new Set((metrica.dimensoesPermitidas ?? []).map(lower));
  for (const dim of consulta.dimensoes ?? []) {
    if (!colunaNoPacote(escopo, dim)) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Dimensão ${dim} não está no pacote.`,
        hint: "Declare só colunas certificadas em graoResultado/colunasPorTabela.",
      });
    }
    if (dimensoesOk.size > 0 && !dimensoesOk.has(lower(dim))) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Dimensão ${dim} não é permitida para a métrica ${metrica.alias}.`,
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
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Filtro ${filtro.coluna} não está no pacote.`,
        hint: "Use colunas do dataset publicado.",
      });
    }
    const colQ = qualificarColuna(escopo, filtro.coluna);
    where.push(
      filtro.op === "in" ? `${colQ} IN (:${filtro.param})` : `${colQ} ${filtro.op} :${filtro.param}`,
    );
    elementos.push(`filtro:${filtro.coluna}`);
  }
  const statusIncluidos = metrica.statusIncluidos ?? [];
  if (statusIncluidos.length > 0 && !consulta.filtros?.some((item) => /status/i.test(item.coluna))) {
    const lista = statusIncluidos.map((item) => `'${item.replaceAll("'", "''")}'`).join(", ");
    const colStatus =
      Object.values(escopo.colunasPorTabela)
        .flat()
        .find((item) => /status/i.test(item)) ?? "Status";
    where.push(`${qualificarColuna(escopo, colStatus)} IN (${lista})`);
    elementos.push(`kpi-status:${colStatus}`);
  }
  const colunaPeriodo = consulta.periodo?.coluna ?? metrica.colunaData;
  if (consulta.periodo) {
    if (!colunaNoPacote(escopo, consulta.periodo.coluna)) {
      throw new DomainError({
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
  } else if (colunaPeriodo && consulta.periodo === undefined && metrica.colunaData) {
    elementos.push(`kpi-data:${metrica.colunaData}`);
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
  const order: string[] = [];
  for (const item of consulta.ordenacao ?? []) {
    if (!colunaNoPacote(escopo, item.coluna) && lower(item.coluna) !== lower(consulta.metrica)) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Ordenação ${item.coluna} não está no pacote.`,
        hint: "Ordene só por dimensão ou métrica certificada.",
      });
    }
    order.push(`${qualificarColuna(escopo, item.coluna)} ${item.dir.toUpperCase()}`);
    elementos.push(`ordenacao:${item.coluna}`);
  }
  const tabelas: string[] = [];
  const addTabela = (nome: string | null): void => {
    if (nome && !tabelas.some((item) => lower(item) === lower(nome))) {
      tabelas.push(nome);
    }
  };
  for (const nome of tabelasDaExpr(escopo, metrica.expr)) {
    addTabela(nome);
  }
  addTabela(tabelaDaColuna(escopo, metrica.alias));
  for (const dim of consulta.dimensoes ?? []) {
    addTabela(tabelaDaColuna(escopo, dim));
  }
  if (tabelas.length === 0) {
    addTabela(escopo.tabelas[0] ?? null);
  }
  if (tabelas.length === 0) {
    throw new DomainError({
      code: ERROR_CODES.PACOTE_INCOMPLETO,
      message: "Pacote sem tabela para consulta semântica.",
      hint: "Publique a skill com sqlModelo e escopo.",
    });
  }
  const joins = caminhoJoins(escopo, tabelas);
  const sql = [
    `SELECT ${select.join(", ")}`,
    `FROM ${tabelas[0]}`,
    ...joins,
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    group.length > 0 ? `GROUP BY ${group.join(", ")}` : "",
    order.length > 0 ? `ORDER BY ${order.join(", ")}` : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
  return { sql, elementos };
};
