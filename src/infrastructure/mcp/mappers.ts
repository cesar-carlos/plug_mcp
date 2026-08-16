import type { ConsultarDadosResult } from "../../application/use-cases/consultar-dados.js";
import type { ListarAnotacoesResult } from "../../application/use-cases/listar-anotacoes.js";
import type { ObterFonteResult } from "../../application/use-cases/obter-fonte.js";
import type { FonteRelacionamento } from "../../domain/entities/fonte.js";

const mapDestino = (
  destino: FonteRelacionamento["destino"],
): { tipo: "fonte"; slug: string } | { tipo: "tabela"; nome: string } =>
  destino.tipo === "fonte"
    ? { tipo: "fonte", slug: destino.slug }
    : { tipo: "tabela", nome: destino.nome };

export const mapConsultarDados = (result: ConsultarDadosResult): ConsultarDadosResult => result;

export const mapObterFonte = (
  result: ObterFonteResult,
): {
  success: true;
  fonte: string;
  nome: string;
  descricao: string;
  origem: "seed" | "minha";
  dialeto: ObterFonteResult["dialeto"];
  sql_base: string;
  observacoes_dialeto: string;
  colunas: { nome: string; tipo: string; descricao: string; regra: string | null }[];
  relacionamentos: {
    coluna: string;
    destino: { tipo: "fonte"; slug: string } | { tipo: "tabela"; nome: string };
    coluna_destino: string;
    tipo_join: string;
    descricao: string;
  }[];
  regras: { nome: string; descricao: string; expressao: string | null }[];
  sinonimos: { termo: string; descricao: string }[];
  anotacoes: {
    id: string;
    tipo: string;
    titulo: string;
    texto: string;
    escopo: "fonte" | "agente";
  }[];
  orientacoes_ia: readonly string[];
} => ({
  success: true,
  fonte: result.fonte.slug,
  nome: result.fonte.nome,
  descricao: result.fonte.descricao,
  origem: result.origem,
  dialeto: result.dialeto,
  sql_base: result.sqlBase,
  observacoes_dialeto: result.observacoesDialeto,
  colunas: result.colunas.map((coluna) => ({
    nome: coluna.nome,
    tipo: coluna.tipo,
    descricao: coluna.descricao,
    regra: coluna.regraNegocio,
  })),
  relacionamentos: result.relacionamentos.map((rel) => ({
    coluna: rel.colunaOrigem,
    destino: mapDestino(rel.destino),
    coluna_destino: rel.colunaDestino,
    tipo_join: rel.tipoJoin,
    descricao: rel.descricao,
  })),
  regras: result.regras.map((regra) => ({
    nome: regra.nome,
    descricao: regra.descricao,
    expressao: regra.expressao,
  })),
  sinonimos: result.sinonimos.map((sin) => ({ termo: sin.termo, descricao: sin.descricao })),
  anotacoes: result.anotacoes.map((nota) => ({
    id: nota.id,
    tipo: nota.tipo,
    titulo: nota.titulo,
    texto: nota.texto,
    escopo: nota.fonteId === null ? ("agente" as const) : ("fonte" as const),
  })),
  orientacoes_ia: result.orientacoesIa,
});

export const mapListarAnotacoes = (
  result: ListarAnotacoesResult,
): {
  success: true;
  total: number;
  anotacoes: {
    id: string;
    tipo: string;
    titulo: string;
    texto: string;
    escopo: "fonte" | "agente";
    fonte: string | null;
    atualizadoEm: string;
  }[];
} => ({
  success: true,
  total: result.total,
  anotacoes: result.anotacoes.map((nota) => ({
    id: nota.id,
    tipo: nota.tipo,
    titulo: nota.titulo,
    texto: nota.texto,
    escopo: nota.fonteId === null ? ("agente" as const) : ("fonte" as const),
    fonte: nota.fonteSlug,
    atualizadoEm: nota.updatedAt.toISOString(),
  })),
});
