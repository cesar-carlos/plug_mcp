export type SensibilidadeColuna = "livre" | "pessoal" | "sensivel" | "segredo";

const RANK: Record<SensibilidadeColuna, number> = {
  livre: 0,
  pessoal: 1,
  sensivel: 2,
  segredo: 3,
};

export const parseSensibilidadeColuna = (value: unknown): SensibilidadeColuna =>
  value === "pessoal" || value === "sensivel" || value === "segredo" || value === "livre"
    ? value
    : "livre";

export const maxSensibilidade = (values: readonly SensibilidadeColuna[]): SensibilidadeColuna => {
  let max: SensibilidadeColuna = "livre";
  for (const value of values) {
    if (RANK[value] > RANK[max]) {
      max = value;
    }
  }
  return max;
};

const SEGREDO = /\b(senha|password|passwd|secret|token|api[_-]?key|chave|hash|salt|private)\b/i;

/** Só segredo é inferido pelo nome. Pessoal e sensível exigem confirmação do usuário. */
export const inferirSensibilidadeColuna = (nome: string): SensibilidadeColuna => {
  if (SEGREDO.test(nome.toLowerCase())) {
    return "segredo";
  }
  return "livre";
};

/**
 * Classe gravada por inferência antiga de pessoal/sensível não bloqueia projeção.
 * Confirmação explícita (`confirmado_usuario`) permanece.
 */
export const sensibilidadeGravadaEfetiva = (input: {
  nome: string;
  gravada: SensibilidadeColuna;
  origem?: string | null;
}): SensibilidadeColuna => {
  if (input.origem === "confirmado_usuario") {
    return input.gravada;
  }
  if (input.gravada !== "pessoal" && input.gravada !== "sensivel") {
    return input.gravada;
  }
  const inferida = inferirSensibilidadeColuna(input.nome);
  return inferida === "segredo" ? inferida : "livre";
};
