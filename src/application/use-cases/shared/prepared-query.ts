import type { PlanoConsulta } from "./planejar-consulta.js";
/** Plano autorizado interno. Credenciais nunca fazem parte deste objeto. */
export interface PreparedQuery {
  readonly sql: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly acessoId: string;
  readonly usuarioId: string;
  readonly publicacoes: NonNullable<PlanoConsulta["publicacoes"]>;
  readonly maxRows: number;
  readonly timeoutMs?: number;
  readonly planoConsulta: PlanoConsulta;
}
