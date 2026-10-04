import type { Skill } from "./skill.js";

export type TipoDocumentoTreino = "caso" | "relatorio" | "feedback";
export interface DocumentoTreino {
  readonly id: string;
  readonly acessoId: string;
  readonly skillId: string | null;
  readonly tipo: TipoDocumentoTreino;
  readonly versao: number;
  readonly conteudo: Readonly<Record<string, unknown>>;
  readonly autorUsuarioId: string | null;
  readonly createdAt: string;
}
export interface GraoConfirmado {
  readonly significado: string;
  readonly chaves: readonly string[];
  readonly evidencia: "declaracao_usuario" | "constraint_banco";
}
export const conteudoSkillParaTeste = (skill: Skill): unknown => ({
  sqlModelo: skill.sqlModelo,
  params: skill.params,
  escopo: skill.escopo,
  consultaSemantica: skill.consultaSemantica,
  politicaConsulta: skill.politicaConsulta,
});
