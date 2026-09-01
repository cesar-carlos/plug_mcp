import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import {
  chaveRelacionamentoEscopo,
  paresDoRelacionamento,
  type EscopoSkill,
} from "../../../domain/entities/escopo.js";
import { tipoCompativelComPapel } from "../../../domain/entities/merge-fato.js";
import {
  colunaPedeOverlayKpi,
  escopoTemMedida,
  metricasMedidaSemDefinicao,
} from "../../../domain/entities/metrica-medida.js";
import {
  fingerprintPares,
  fingerprintParesInvertidos,
  labelPares,
  relacoesSemSubconjuntos,
} from "../../../domain/entities/relacionamento.js";
import type { OrigemFato } from "../../../domain/entities/grafo.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";
import { parseSqlModelo } from "./sql-modelo.js";
import { tryParseSelect } from "./sql-ast.js";

const ORIGENS_OK = new Set<OrigemFato>(["validado_execucao", "confirmado_usuario"]);

/** Só estas origens entram no pacote / validador. Grafo `inferido` (ex. herdar_catalogo) não licencia JOIN. */
export const origemLicenciaPacote = (origem: OrigemFato): boolean => ORIGENS_OK.has(origem);

export type FaltaNextAction =
  | "treinar_sql"
  | "confirmar_relacionamento"
  | "remover_relacionamento"
  | "mapear_tabela"
  | "confirmar_coluna"
  | "listar_conflitos"
  | "atualizar_skill";

export interface FatoIncompleto {
  readonly kind: "tabela" | "coluna" | "join" | "perfil" | "conflito" | "kpi";
  readonly message: string;
  readonly alvo: string;
  readonly nextAction: FaltaNextAction;
}

export const faltaOrientaSemBloquear = (falta: FatoIncompleto): boolean =>
  falta.kind === "kpi" || falta.nextAction === "remover_relacionamento";

const lower = (value: string): string => value.trim().toLowerCase();

const falta = (
  kind: FatoIncompleto["kind"],
  alvo: string,
  message: string,
  nextAction: FaltaNextAction,
): FatoIncompleto => ({ kind, alvo, message, nextAction });

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
      out.push(falta("tabela", nome, `Tabela ${nome} ausente no grafo.`, "treinar_sql"));
      continue;
    }
    if (tabela.status === "conflito") {
      out.push(falta("conflito", nome, `Tabela ${nome} em conflito.`, "listar_conflitos"));
    }
    if (!origemLicenciaPacote(tabela.origem)) {
      out.push(
        falta(
          "tabela",
          nome,
          `Tabela ${nome} ainda é ${tabela.origem}; precisa validado_execucao ou confirmado_usuario.`,
          "treinar_sql",
        ),
      );
    }
    const cols = await grafo.listColunas(tabela.id);
    const wanted = escopo.colunasPorTabela[nome] ?? [];
    for (const colunaNome of wanted) {
      const alvo = `${nome}.${colunaNome}`;
      const coluna = cols.find((item) => lower(item.nome) === lower(colunaNome));
      if (!coluna) {
        out.push(falta("coluna", alvo, `Coluna ${alvo} ausente no grafo.`, "confirmar_coluna"));
        continue;
      }
      if (coluna.status === "conflito") {
        out.push(falta("conflito", alvo, `Coluna ${alvo} em conflito.`, "listar_conflitos"));
      }
      if (!origemLicenciaPacote(coluna.origem)) {
        out.push(
          falta("coluna", alvo, `Coluna ${alvo} ainda é ${coluna.origem}.`, "confirmar_coluna"),
        );
      }
      if (opts.exigirTipoColuna && !coluna.tipo && !coluna.formato) {
        out.push(
          falta(
            "perfil",
            alvo,
            `Coluna ${alvo} sem tipo/formato. Chame mapear_tabela.`,
            "mapear_tabela",
          ),
        );
      }
      if (!tipoCompativelComPapel(coluna.tipo, coluna.papel)) {
        out.push(
          falta(
            "perfil",
            alvo,
            `Coluna ${alvo} tem papel ${coluna.papel ?? "data"} incompatível com tipo ${coluna.tipo ?? "(vazio)"}. Chame mapear_tabela.`,
            "mapear_tabela",
          ),
        );
      }
      const temOverlay = escopo.metricasSaida.some(
        (item) => item.alias.toLowerCase() === colunaNome.toLowerCase(),
      );
      if (colunaPedeOverlayKpi(coluna.papel, colunaNome) && !temOverlay) {
        const jaTem = out.some(
          (item) => item.kind === "kpi" && item.alvo.toLowerCase() === alvo.toLowerCase(),
        );
        if (!jaTem) {
          out.push(
            falta(
              "kpi",
              alvo,
              `Medida ${alvo} sem definição em metricasSaida. Overlay via atualizar_skill.metricasSaida ou registrar_aprendizado tipo=metrica. Não invente a definição.`,
              "atualizar_skill",
            ),
          );
        }
      }
    }
  }
  const rels = await grafo.listRelacionamentos(agentId);
  const relsComPares = escopo.relacionamentos.map((rel) => ({
    ...rel,
    pares: paresDoRelacionamento(rel),
  }));
  const semSubset = relacoesSemSubconjuntos(relsComPares);
  const keepKeys = new Set(semSubset.map((rel) => chaveRelacionamentoEscopo(rel)));
  for (const rel of relsComPares) {
    const pares = rel.pares;
    const label = labelPares(rel.tabelaOrigem, rel.tabelaDestino, pares);
    const chave = chaveRelacionamentoEscopo(rel);
    if (!keepKeys.has(chave)) {
      out.push(
        falta(
          "join",
          label,
          `JOIN isolado ${label} está coberto por um composto. Chame remover_relacionamento (fingerprint / pares[]).`,
          "remover_relacionamento",
        ),
      );
      continue;
    }
    const origemTabela = await grafo.findTabelaByNome(agentId, rel.tabelaOrigem);
    const destinoTabela = await grafo.findTabelaByNome(agentId, rel.tabelaDestino);
    if (!origemTabela || !destinoTabela) {
      out.push(
        falta("join", label, `JOIN ${label} não confirmado no grafo.`, "confirmar_relacionamento"),
      );
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
      out.push(
        falta("join", label, `JOIN ${label} não confirmado no grafo.`, "confirmar_relacionamento"),
      );
      continue;
    }
    if (match.status === "conflito") {
      out.push(falta("conflito", label, `JOIN ${label} em conflito.`, "listar_conflitos"));
    }
    if (!origemLicenciaPacote(match.origem)) {
      out.push(
        falta("join", label, `JOIN ${label} ainda é ${match.origem}.`, "confirmar_relacionamento"),
      );
    }
    if (opts.exigirCardinalidade && !match.cardinalidade) {
      out.push(
        falta(
          "perfil",
          label,
          `JOIN ${label} sem cardinalidade → confirmar_relacionamento.`,
          "confirmar_relacionamento",
        ),
      );
    }
  }
  for (const metrica of metricasMedidaSemDefinicao(escopo)) {
    const jaTem = out.some(
      (item) => item.kind === "kpi" && item.alvo.toLowerCase() === metrica.alias.toLowerCase(),
    );
    if (jaTem) {
      continue;
    }
    out.push(
      falta(
        "kpi",
        metrica.alias,
        `Medida ${metrica.alias} sem definição. Overlay em atualizar_skill.metricasSaida ou registrar_aprendizado tipo=metrica (só alias já no SELECT). Não invente a definição.`,
        "atualizar_skill",
      ),
    );
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
  const bloqueantes = faltas.filter(
    (item) => item.kind !== "perfil" && !faltaOrientaSemBloquear(item),
  );
  if (bloqueantes.length === 0) {
    return;
  }
  throw DomainError.pacote({
    code: ERROR_CODES.PACOTE_INCOMPLETO,
    message: "O SQL da skill ainda não está confirmado no grafo.",
    hint: `${bloqueantes.map((item) => item.message).join(" ")} Chame treinar_com_sql e confirme relacionamentos no escopo da skill.`,
    details: { faltas: bloqueantes },
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
    exigirTipoColuna: escopoTemMedida(escopo),
  });
  const bloqueantes = faltas.filter((item) => !faltaOrientaSemBloquear(item));
  if (bloqueantes.length > 0) {
    const perfil = bloqueantes.filter((item) => item.kind === "perfil");
    throw DomainError.pacote({
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
    throw DomainError.pacote({
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
