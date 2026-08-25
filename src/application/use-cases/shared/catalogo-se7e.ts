import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { Cardinalidade, PapelColuna } from "../../../domain/entities/escopo.js";

export interface ColunaCatalogo {
  readonly nome: string;
  readonly tipo: string;
  readonly papel: PapelColuna;
  readonly descricao: string;
}

export interface RelacionamentoCatalogo {
  readonly tabelaOrigem: string;
  readonly colunaOrigem: string;
  readonly tabelaDestino: string;
  readonly colunaDestino: string;
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
    descricao: "Títulos a receber.",
    colunas: [
      { nome: "codcli", tipo: "integer", papel: "chave", descricao: "Cliente" },
      { nome: "valor", tipo: "numeric", papel: "medida", descricao: "Valor do título" },
      { nome: "vencimento", tipo: "date", papel: "data", descricao: "Vencimento" },
      { nome: "empresa", tipo: "integer", papel: "dimensao", descricao: "Empresa" },
      { nome: "filial", tipo: "integer", papel: "dimensao", descricao: "Filial" },
    ],
  },
];

const relacionamentosComuns = (): readonly RelacionamentoCatalogo[] => [
  {
    tabelaOrigem: "filial",
    colunaOrigem: "empresa",
    tabelaDestino: "empresa",
    colunaDestino: "empresa",
    tipoJoin: "inner",
    cardinalidade: "N:1",
  },
  {
    tabelaOrigem: "cliente",
    colunaOrigem: "codcli",
    tabelaDestino: "receber",
    colunaDestino: "codcli",
    tipoJoin: "inner",
    cardinalidade: "1:N",
  },
];

export const catalogoSe7eParaDialeto = (dialeto: Dialeto): CatalogoSe7e => ({
  dialeto,
  tabelas: tabelasComuns(),
  relacionamentos: relacionamentosComuns(),
});
