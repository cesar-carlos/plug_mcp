export interface GrafoJoinBody {
  tabelaOrigem: string;
  tabelaDestino: string;
  colunaOrigem: string;
  colunaDestino: string;
  cardinalidade: string;
  tipoJoin?: string;
  confirmadoPeloUsuario?: boolean;
}

export interface AnotacaoGovernanca {
  vigenteDe?: string;
  vigenteAte?: string;
  revisarEm?: string;
}

export interface AnotacaoCriarPayload {
  tipo: string;
  titulo: string;
  texto: string;
  tabela?: string;
  governanca: AnotacaoGovernanca;
}

export interface AnotacaoAtualizarPayload {
  tipo: string;
  titulo: string;
  texto: string;
  governanca: AnotacaoGovernanca;
  confirmadoPeloUsuario: boolean;
  anotacaoId: string;
}

export interface WebhookConfigurarPayload {
  url?: string;
  segredo?: string;
  ativo: boolean;
  confirmadoPeloUsuario: boolean;
}

export interface WebhookRearmarPayload {
  eventoId: string;
  confirmadoPeloUsuario: boolean;
}
