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

const PESSOAL =
  /\b(cpf|cnpj|rg|email|e-mail|telefone|celular|fone|nome|razao|endereco|end[eê]reco|cep|bairro|cidade|nascimento|mae|pai|documento)\b/i;
const SEGREDO = /\b(senha|password|passwd|secret|token|api[_-]?key|chave|hash|salt|private)\b/i;
const SENSIVEL =
  /\b(observa|historico|hist[oó]rico|comentario|coment[aá]rio|anotacao|anota[cç]ao|memo|texto|descricao_livre|obs)\b/i;

export const inferirSensibilidadeColuna = (
  nome: string,
  tipo?: string | null,
): SensibilidadeColuna => {
  const n = nome.toLowerCase();
  if (SEGREDO.test(n)) {
    return "segredo";
  }
  if (PESSOAL.test(n)) {
    return "pessoal";
  }
  if (SENSIVEL.test(n)) {
    return "sensivel";
  }
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("text") || t.includes("clob") || t.includes("ntext")) {
    return "sensivel";
  }
  return "livre";
};
