import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import { paresDoRelacionamento, type EscopoSkill } from "../../../domain/entities/escopo.js";
import { fingerprintPares, fingerprintParesInvertidos } from "../../../domain/entities/relacionamento.js";
import { labelPares } from "../../../domain/entities/relacionamento.js";
import type { OrigemFato } from "../../../domain/entities/grafo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { parseSqlModelo } from "./sql-modelo.js";
import { tryParseSelect } from "./sql-ast.js";

const ORIGENS_OK = new Set<OrigemFato>(["validado_execucao", "confirmado_usuario"]);

export interface FatoIncompleto {
  readonly kind: "tabela" | "coluna" | "join" | "perfil" | "conflito";
  readonly message: string;
}

const lower = (value: string): string => value.trim().toLowerCase();

export const listarFatosIncompletos = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  escopo: EscopoSkill,
  opts: { exigirCardinalidade: boolean; exigirTipoColuna: boolean },
): Promise<FatoIncompleto[]> => {
  const out: FatoIncompleto[] = [];
  for (const nome of escopo.tabelas) {
    const tabela = await grafo.findTabelaByNome(agentId, nome);
    if (!tabela) {
      out.push({ kind: "tabela", message: `Tabela ${nome} ausente no grafo.` });
      continue;
    }
    if (tabela.status === "conflito") {
      out.push({ kind: "conflito", message: `Tabela ${nome} em conflito.` });
    }
    if (!ORIGENS_OK.has(tabela.origem)) {
      out.push({
        kind: "tabela",
        message: `Tabela ${nome} ainda é ${tabela.origem}; precisa validado_execucao ou confirmado_usuario.`,
      });
    }
    const cols = await grafo.listColunas(tabela.id);
    const wanted = escopo.colunasPorTabela[nome] ?? [];
    for (const colunaNome of wanted) {
      const coluna = cols.find((item) => lower(item.nome) === lower(colunaNome));
      if (!coluna) {
        out.push({ kind: "coluna", message: `Coluna ${nome}.${colunaNome} ausente no grafo.` });
        continue;
      }
      if (coluna.status === "conflito") {
        out.push({ kind: "conflito", message: `Coluna ${nome}.${colunaNome} em conflito.` });
      }
      if (!ORIGENS_OK.has(coluna.origem)) {
        out.push({
          kind: "coluna",
          message: `Coluna ${nome}.${colunaNome} ainda é ${coluna.origem}.`,
        });
      }
      if (opts.exigirTipoColuna && !coluna.tipo && !coluna.formato) {
        out.push({
          kind: "perfil",
          message: `Coluna ${nome}.${colunaNome} sem tipo/formato. Chame validar_skill enriquecer=completo.`,
        });
      }
    }
  }
  const rels = await grafo.listRelacionamentos(agentId);
  for (const rel of escopo.relacionamentos) {
    const origemTabela = await grafo.findTabelaByNome(agentId, rel.tabelaOrigem);
    const destinoTabela = await grafo.findTabelaByNome(agentId, rel.tabelaDestino);
    const pares = paresDoRelacionamento(rel);
    const label = labelPares(rel.tabelaOrigem, rel.tabelaDestino, pares);
    if (!origemTabela || !destinoTabela) {
      out.push({
        kind: "join",
        message: `JOIN ${label} não confirmado no grafo.`,
      });
      continue;
    }
    const fp = fingerprintPares(pares);
    const fpInv = fingerprintParesInvertidos(pares);
    const match = rels.find((item) => {
      const direto =
        item.tabelaOrigemId === origemTabela.id &&
        item.tabelaDestinoId === destinoTabela.id &&
        item.paresFingerprint === fp;
      const inverso =
        item.tabelaOrigemId === destinoTabela.id &&
        item.tabelaDestinoId === origemTabela.id &&
        item.paresFingerprint === fpInv;
      return direto || inverso;
    });
    if (!match) {
      out.push({
        kind: "join",
        message: `JOIN ${label} não confirmado no grafo.`,
      });
      continue;
    }
    if (match.status === "conflito") {
      out.push({
        kind: "conflito",
        message: `JOIN ${label} em conflito.`,
      });
    }
    if (!ORIGENS_OK.has(match.origem)) {
      out.push({
        kind: "join",
        message: `JOIN ${label} ainda é ${match.origem}.`,
      });
    }
    if (opts.exigirCardinalidade && !match.cardinalidade) {
      out.push({
        kind: "perfil",
        message: `JOIN ${label} sem cardinalidade.`,
      });
    }
  }
  return out;
};

export const exigirEscopoNoGrafo = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  escopo: EscopoSkill,
): Promise<void> => {
  const faltas = await listarFatosIncompletos(grafo, agentId, escopo, {
    exigirCardinalidade: false,
    exigirTipoColuna: false,
  });
  const bloqueantes = faltas.filter((item) => item.kind !== "perfil");
  if (bloqueantes.length === 0) {
    return;
  }
  throw new DomainError({
    code: ERROR_CODES.PACOTE_INCOMPLETO,
    message: "O SQL da skill ainda não está confirmado no grafo.",
    hint: `${bloqueantes.map((item) => item.message).join(" ")} Chame treinar_com_sql e confirme relacionamentos no escopo da skill.`,
  });
};

export const exigirPacotePublicavel = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  escopo: EscopoSkill,
  sqlModelo: string,
): Promise<void> => {
  const faltas = await listarFatosIncompletos(grafo, agentId, escopo, {
    exigirCardinalidade: escopo.relacionamentos.length > 0,
    exigirTipoColuna: escopo.metricasSaida.length > 0,
  });
  if (faltas.length > 0) {
    const perfil = faltas.filter((item) => item.kind === "perfil");
    throw new DomainError({
      code: perfil.length > 0 ? ERROR_CODES.PERFIL_AUSENTE : ERROR_CODES.PACOTE_INCOMPLETO,
      message:
        perfil.length > 0
          ? "Perfil incompleto: tipo, formato ou cardinalidade ausentes."
          : "Pacote da skill incompleto para publicar.",
      hint: faltas.map((item) => item.message).join(" "),
      details: { faltas },
    });
  }
  const ast = tryParseSelect(sqlModelo);
  const modelo = parseSqlModelo(sqlModelo);
  if (!ast?.temWhere && !ast?.temAgregacaoLocal) {
    throw new DomainError({
      code: ERROR_CODES.CONSULTA_SEM_RECORTE,
      message: "Consulta exemplo sem WHERE nem agregação.",
      hint: "A skill publicada precisa recortar ou agregar. Ajuste o sqlModelo.",
    });
  }
  void modelo;
};

export const countConflitosNoEscopo = async (
  grafo: GrafoRepositoryPort,
  agentId: string,
  escopo: EscopoSkill,
): Promise<number> => {
  const faltas = await listarFatosIncompletos(grafo, agentId, escopo, {
    exigirCardinalidade: false,
    exigirTipoColuna: false,
  });
  return faltas.filter((item) => item.kind === "conflito").length;
};
