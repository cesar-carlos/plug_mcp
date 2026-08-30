import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { Cardinalidade, PapelColuna } from "../../../domain/entities/escopo.js";
import type { ParRelacionamento } from "../../../domain/entities/relacionamento.js";

export interface ColunaCatalogo {
  readonly nome: string;
  readonly tipo: string;
  readonly papel: PapelColuna;
  readonly descricao: string;
}

export interface RelacionamentoCatalogo {
  readonly tabelaOrigem: string;
  readonly tabelaDestino: string;
  readonly pares: readonly ParRelacionamento[];
  readonly tipoJoin: string;
  readonly cardinalidade: Cardinalidade;
}

export interface TabelaCatalogo {
  readonly nome: string;
  readonly descricao: string;
  readonly colunas: readonly ColunaCatalogo[];
}

export interface CatalogoSe7e {
  readonly dialeto: Dialeto;
  readonly tabelas: readonly TabelaCatalogo[];
  readonly relacionamentos: readonly RelacionamentoCatalogo[];
}

const colunasTitulo = (): readonly ColunaCatalogo[] => [
  { nome: "codcli", tipo: "integer", papel: "chave", descricao: "Cliente" },
  { nome: "documento", tipo: "varchar", papel: "codigo", descricao: "Número do título" },
  { nome: "status", tipo: "varchar", papel: "codigo", descricao: "Situação do título" },
  { nome: "valor", tipo: "numeric", papel: "medida", descricao: "Valor do título" },
  { nome: "vencimento", tipo: "date", papel: "data", descricao: "Vencimento" },
  { nome: "empresa", tipo: "integer", papel: "dimensao", descricao: "Empresa" },
  { nome: "filial", tipo: "integer", papel: "dimensao", descricao: "Filial" },
];

const paresEmpresaFilial: readonly ParRelacionamento[] = [
  { colunaOrigem: "empresa", colunaDestino: "empresa" },
  { colunaOrigem: "filial", colunaDestino: "filial" },
];

const tabelasComuns = (): readonly TabelaCatalogo[] => [
  {
    nome: "empresa",
    descricao: "Cadastro de empresa (recorte consolidado vs. uma empresa).",
    colunas: [
      { nome: "empresa", tipo: "integer", papel: "chave", descricao: "Código da empresa" },
      { nome: "razao", tipo: "varchar", papel: "dimensao", descricao: "Razão social" },
    ],
  },
  {
    nome: "filial",
    descricao: "Cadastro de filial.",
    colunas: [
      { nome: "empresa", tipo: "integer", papel: "chave", descricao: "Empresa da filial" },
      { nome: "filial", tipo: "integer", papel: "chave", descricao: "Código da filial" },
      { nome: "nome", tipo: "varchar", papel: "dimensao", descricao: "Nome da filial" },
    ],
  },
  {
    nome: "cliente",
    descricao: "Cadastro de cliente.",
    colunas: [
      { nome: "codcli", tipo: "integer", papel: "chave", descricao: "Código do cliente" },
      { nome: "nome", tipo: "varchar", papel: "dimensao", descricao: "Nome" },
      { nome: "empresa", tipo: "integer", papel: "dimensao", descricao: "Empresa" },
      { nome: "filial", tipo: "integer", papel: "dimensao", descricao: "Filial" },
    ],
  },
  {
    nome: "produto",
    descricao: "Cadastro de produto.",
    colunas: [
      { nome: "codprod", tipo: "integer", papel: "chave", descricao: "Código do produto" },
      { nome: "descricao", tipo: "varchar", papel: "dimensao", descricao: "Descrição" },
      { nome: "unidade", tipo: "varchar", papel: "codigo", descricao: "Unidade" },
    ],
  },
  {
    nome: "receber",
    descricao: "Títulos a receber (template ilustrativo, não dump certificado).",
    colunas: colunasTitulo(),
  },
  {
    nome: "pagar",
    descricao: "Títulos a pagar (template ilustrativo, não dump certificado).",
    colunas: colunasTitulo(),
  },
];

const relacionamentosComuns = (): readonly RelacionamentoCatalogo[] => [
  {
    tabelaOrigem: "filial",
    tabelaDestino: "empresa",
    pares: [{ colunaOrigem: "empresa", colunaDestino: "empresa" }],
    tipoJoin: "inner",
    cardinalidade: "N:1",
  },
  {
    tabelaOrigem: "receber",
    tabelaDestino: "filial",
    pares: paresEmpresaFilial,
    tipoJoin: "inner",
    cardinalidade: "N:1",
  },
  {
    tabelaOrigem: "pagar",
    tabelaDestino: "filial",
    pares: paresEmpresaFilial,
    tipoJoin: "inner",
    cardinalidade: "N:1",
  },
  {
    tabelaOrigem: "cliente",
    tabelaDestino: "receber",
    pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
    tipoJoin: "inner",
    cardinalidade: "1:N",
  },
  {
    tabelaOrigem: "cliente",
    tabelaDestino: "pagar",
    pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
    tipoJoin: "inner",
    cardinalidade: "1:N",
  },
];

export const catalogoSe7eParaDialeto = (dialeto: Dialeto): CatalogoSe7e => ({
  dialeto,
  tabelas: tabelasComuns(),
  relacionamentos: relacionamentosComuns(),
});
