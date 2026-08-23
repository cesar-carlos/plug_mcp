export type StatusSkill = "rascunho" | "validada" | "publicada";

export interface Skill {
  readonly id: string;
  readonly agentId: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly versao: number;
  readonly status: StatusSkill;
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NovaSkill {
  readonly agentId: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sqlModelo: string;
  readonly autorUsuarioId: string | null;
}

export interface AnotacaoGrafo {
  readonly id: string;
  readonly agentId: string;
  readonly tabelaId: string | null;
  readonly tipo: string;
  readonly titulo: string;
  readonly texto: string;
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
