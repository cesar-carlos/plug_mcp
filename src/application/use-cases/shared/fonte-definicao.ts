import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Ambiente } from "../../../domain/entities/ambiente.js";
import type {
  NovaFonteInput,
  NovaFonteRelacionamentoInput,
} from "../../../domain/entities/fonte.js";
import type { CatalogoQueryPort } from "../../../domain/ports/catalogo-repository.port.js";
import type { TokenEncryptorPort } from "../../../domain/ports/crypto.port.js";
import type { PlugServerGatewayPort } from "../../../domain/ports/plug-server-gateway.port.js";
import type { AmbienteConsultavel } from "./guards.js";
import { parseIdentificadorTabela } from "./schema-introspection.js";

const SLUG_RE = /^[a-z][a-z0-9_]{2,63}$/;
const FROM_RE = /\bFROM\b/i;

export interface ColunaDefinicaoInput {
  nome?: string;
  tipo?: string;
  descricao?: string;
  regraNegocio?: string;
}

export interface RegraDefinicaoInput {
  nome?: string;
  descricao?: string;
  expressao?: string;
}

export interface SinonimoDefinicaoInput {
  termo?: string;
  descricao?: string;
}

export interface RelacionamentoDefinicaoInput {
  colunaOrigem?: string;
  fonteDestinoSlug?: string;
  tabelaDestino?: string;
  colunaDestino?: string;
  tipoJoin?: string;
  descricao?: string;
}

export interface DefinicaoFonteInput {
  slug?: string;
  nome?: string;
  descricao?: string;
  sqlBase?: string;
  observacoesDialeto?: string;
  colunas?: ColunaDefinicaoInput[];
  regras?: RegraDefinicaoInput[];
  sinonimos?: SinonimoDefinicaoInput[];
  relacionamentos?: RelacionamentoDefinicaoInput[];
}

export interface DefinicaoFonte {
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlBase: string;
  readonly observacoesDialeto: string;
  readonly colunas: readonly {
    nome: string;
    tipo: string;
    descricao: string;
    regraNegocio: string | null;
    ordem: number;
  }[];
  readonly regras: readonly { nome: string; descricao: string; expressao: string | null }[];
  readonly sinonimos: readonly { termo: string; descricao: string }[];
  readonly relacionamentos: readonly {
    colunaOrigem: string;
    colunaDestino: string;
    tipoJoin: string;
    descricao: string;
    destino: { tipo: "fonte"; slug: string } | { tipo: "tabela"; nome: string };
  }[];
}

const emptyToNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null;
};

const fail = (message: string, hint: string): never => {
  throw new DomainError({ code: ERROR_CODES.VALIDATION_ERROR, message, hint });
};

const requireText = (
  value: string | undefined,
  campo: string,
  min: number,
  max: number,
  hint: string,
): string => {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < min || trimmed.length > max) {
    fail(`${campo} deve ter entre ${min} e ${max} caracteres.`, hint);
  }
  return trimmed;
};

export const requireSqlClassificavel = (sql: string | undefined): string => {
  const trimmed = sql?.trim() ?? "";
  if (trimmed.length < 20 || trimmed.length > 20_000) {
    fail(
      "sql deve ter entre 20 e 20000 caracteres.",
      "Envie um SELECT completo com FROM de tabela real. Use explorar_tabelas / descrever_tabela se o nome for incerto.",
    );
  }
  if (!FROM_RE.test(trimmed)) {
    fail(
      "O SQL precisa de um FROM referenciando tabela ou view real.",
      "Ajuste o SQL para incluir FROM com uma tabela do ERP. Sem FROM o agente recusa a autorização. Use testar_sql depois de corrigir.",
    );
  }
  return trimmed;
};

export const parseDefinicaoFonte = (input: DefinicaoFonteInput): DefinicaoFonte => {
  const slug = input.slug?.trim() ?? "";
  if (!SLUG_RE.test(slug)) {
    fail(
      "slug inválido.",
      "Use um slug em minúsculas começando por letra, só a-z, 0-9 e _, com 3 a 64 caracteres (ex.: contas_pagar).",
    );
  }
  const nome = requireText(
    input.nome,
    "nome",
    3,
    120,
    "Peça ao usuário um nome curto da consulta (ex.: Contas a pagar).",
  );
  const descricao = requireText(
    input.descricao,
    "descricao",
    10,
    500,
    "Peça ao usuário o que a consulta responde em linguagem de negócio. Esse texto aparece em listar_fontes.",
  );
  const sqlBase = requireSqlClassificavel(input.sqlBase);
  const observacoesDialeto = (input.observacoesDialeto?.trim() ?? "").slice(0, 2000);
  const colunasIn = input.colunas ?? [];
  if (colunasIn.length < 1 || colunasIn.length > 100) {
    fail(
      "Informe entre 1 e 100 colunas.",
      "Liste cada coluna do SELECT com nome, tipo e significado de negócio informado pelo usuário. Não invente semântica.",
    );
  }
  const nomes = new Set<string>();
  const colunas = colunasIn.map((col, index) => {
    const nomeCol = requireText(
      col.nome,
      `colunas[${index}].nome`,
      1,
      128,
      "Use o nome da coluna exatamente como no SQL.",
    );
    const chave = nomeCol.toLowerCase();
    if (nomes.has(chave)) {
      fail(`Coluna duplicada: ${nomeCol}.`, "Remova duplicatas da lista de colunas.");
    }
    nomes.add(chave);
    return {
      nome: nomeCol,
      tipo: requireText(
        col.tipo,
        `colunas[${index}].tipo`,
        1,
        64,
        "Informe o tipo (integer, decimal, datetime, text, …).",
      ),
      descricao: requireText(
        col.descricao,
        `colunas[${index}].descricao`,
        3,
        500,
        "Peça ao usuário o significado de negócio desta coluna. Não invente. Se a amostra mostrou um código (Status='A'), pergunte o dicionário e grave em regraNegocio.",
      ),
      regraNegocio: emptyToNull(col.regraNegocio),
      ordem: index + 1,
    };
  });
  if ((input.regras?.length ?? 0) > 50) {
    fail("No máximo 50 regras.", "Consolide regras de negócio; não despeje o schema.");
  }
  if ((input.sinonimos?.length ?? 0) > 50) {
    fail("No máximo 50 sinônimos.", "Mantenha só termos que o usuário realmente usa.");
  }
  if ((input.relacionamentos?.length ?? 0) > 20) {
    fail("No máximo 20 relacionamentos.", "Relacione só fontes visíveis neste ambiente.");
  }
  const joins = new Set(["inner", "left", "right"]);
  return {
    slug,
    nome,
    descricao,
    sqlBase,
    observacoesDialeto,
    colunas,
    regras: (input.regras ?? []).map((regra, index) => ({
      nome: requireText(regra.nome, `regras[${index}].nome`, 1, 120, "Nomeie a regra de negócio."),
      descricao: requireText(
        regra.descricao,
        `regras[${index}].descricao`,
        3,
        500,
        "Descreva a restrição em linguagem de negócio.",
      ),
      expressao: emptyToNull(regra.expressao),
    })),
    sinonimos: (input.sinonimos ?? []).map((sin, index) => ({
      termo: requireText(
        sin.termo,
        `sinonimos[${index}].termo`,
        1,
        80,
        "Informe o termo sinônimo.",
      ),
      descricao: (sin.descricao?.trim() ?? "").slice(0, 200),
    })),
    relacionamentos: (input.relacionamentos ?? []).map((rel, index) =>
      parseUmRelacionamento(rel, index, joins),
    ),
  };
};

export const parseUmRelacionamento = (
  rel: RelacionamentoDefinicaoInput,
  index: number,
  joins = new Set(["inner", "left", "right"]),
): DefinicaoFonte["relacionamentos"][number] => {
  const rawJoin = rel.tipoJoin?.trim().toLowerCase() ?? "";
  const tipoJoin = rawJoin.length > 0 ? rawJoin : "inner";
  if (!joins.has(tipoJoin)) {
    fail(`relacionamentos[${index}].tipoJoin inválido.`, "Use inner, left ou right.");
  }
  const slugDestino = rel.fonteDestinoSlug?.trim() ?? "";
  const tabela = rel.tabelaDestino?.trim() ?? "";
  if (slugDestino.length > 0 === tabela.length > 0) {
    fail(
      `relacionamentos[${index}] precisa de fonteDestinoSlug OU tabelaDestino.`,
      "Informe o slug de uma fonte já visível em listar_fontes, ou o nome da tabela crua do ERP (não os dois).",
    );
  }
  if (tabela.length > 0) {
    if (tabela.length > 128) {
      fail(
        `relacionamentos[${index}].tabelaDestino excede 128 caracteres.`,
        "Use schema.tabela com identificadores curtos, sem SQL concatenado.",
      );
    }
    parseIdentificadorTabela(tabela);
  }
  return {
    colunaOrigem: requireText(
      rel.colunaOrigem,
      `relacionamentos[${index}].colunaOrigem`,
      1,
      128,
      "Coluna desta fonte usada no join.",
    ),
    colunaDestino: requireText(
      rel.colunaDestino,
      `relacionamentos[${index}].colunaDestino`,
      1,
      128,
      "Coluna da fonte ou tabela destino.",
    ),
    tipoJoin,
    descricao: (rel.descricao?.trim() ?? "").slice(0, 300),
    destino:
      slugDestino.length > 0
        ? { tipo: "fonte" as const, slug: slugDestino }
        : { tipo: "tabela" as const, nome: tabela },
  };
};

export const montarNovaFonte = (
  ambiente: Ambiente,
  definicao: DefinicaoFonte,
  relacionamentos: NovaFonteInput["relacionamentos"],
): NovaFonteInput => ({
  escopo: { mcpAccountId: ambiente.mcpAccountId, agentId: ambiente.agentId },
  slug: definicao.slug,
  nome: definicao.nome,
  descricao: definicao.descricao,
  dialeto: ambiente.dialeto,
  sqlBase: definicao.sqlBase,
  observacoesDialeto: definicao.observacoesDialeto,
  colunas: definicao.colunas,
  regras: definicao.regras,
  sinonimos: definicao.sinonimos,
  relacionamentos,
});

export const resolverRelacionamentos = async (
  catalogo: CatalogoQueryPort,
  ambiente: Ambiente,
  relacionamentos: DefinicaoFonte["relacionamentos"],
): Promise<readonly NovaFonteRelacionamentoInput[]> => {
  const escopo = { mcpAccountId: ambiente.mcpAccountId, agentId: ambiente.agentId };
  const resolved: NovaFonteRelacionamentoInput[] = [];
  for (const rel of relacionamentos) {
    if (rel.destino.tipo === "tabela") {
      resolved.push({
        colunaOrigem: rel.colunaOrigem,
        colunaDestino: rel.colunaDestino,
        tipoJoin: rel.tipoJoin,
        descricao: rel.descricao,
        destino: { tipo: "tabela", tabelaDestino: rel.destino.nome },
      });
      continue;
    }
    const destino = await catalogo.findFonteBySlug(rel.destino.slug, escopo);
    if (!destino?.ativo) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Fonte destino '${rel.destino.slug}' não existe neste ambiente.`,
        hint: "Chame listar_fontes e use um slug visível, ou informe tabelaDestino se o cruzamento é com tabela crua do ERP.",
      });
    }
    resolved.push({
      colunaOrigem: rel.colunaOrigem,
      colunaDestino: rel.colunaDestino,
      tipoJoin: rel.tipoJoin,
      descricao: rel.descricao,
      destino: {
        tipo: "fonte",
        fonteDestinoId: destino.id,
        fonteDestinoSlug: rel.destino.slug,
      },
    });
  }
  return resolved;
};

export const executarDryRun = async (
  deps: { plug: PlugServerGatewayPort; crypto: TokenEncryptorPort },
  ambiente: AmbienteConsultavel,
  definicao: DefinicaoFonte,
): Promise<{ avisos: string[] }> => {
  const result = await deps.plug.executeSql({
    agentId: ambiente.agentId,
    clientToken: deps.crypto.decrypt(ambiente.clientTokenEncriptado),
    sql: definicao.sqlBase,
    options: { maxRows: 1 },
  });
  const returned = new Set(result.columns.map((col) => col.toLowerCase()));
  const missing = definicao.colunas.filter((col) => !returned.has(col.nome.toLowerCase()));
  if (missing.length > 0) {
    fail(
      `O SQL não devolveu as colunas declaradas: ${missing.map((col) => col.nome).join(", ")}.`,
      "Ajuste sqlBase ou a lista de colunas para coincidir com o resultado. Use descrever_tabela para conferir os nomes.",
    );
  }
  const declared = new Set(definicao.colunas.map((col) => col.nome.toLowerCase()));
  return {
    avisos: result.columns
      .filter((col) => !declared.has(col.toLowerCase()))
      .map(
        (col) =>
          `Coluna '${col}' veio no SQL e não foi declarada; a IA não a usará até você incluí-la com descrição de negócio.`,
      ),
  };
};
