const MAX_DISTANCIA_PADRAO = 2;

export const distanciaEdicao = (a: string, b: string): number => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) {
    return 0;
  }
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = Array.from({ length: cols }, (_, j) => j);
  const curr = Array.from({ length: cols }, () => 0);
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    const leftCh = left[i - 1];
    for (let j = 1; j < cols; j += 1) {
      const cost = leftCh === right[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j < cols; j += 1) {
      prev[j] = curr[j] ?? 0;
    }
  }
  return prev[right.length] ?? 0;
};

export const sugerirProximos = (
  nome: string,
  candidatos: readonly string[],
  limite = 5,
): string[] => {
  const wanted = nome.trim();
  if (!wanted || candidatos.length === 0) {
    return [];
  }
  const maxDist = Math.max(MAX_DISTANCIA_PADRAO, Math.floor(wanted.length / 3));
  const scored = candidatos
    .map((candidato) => ({ candidato, distancia: distanciaEdicao(wanted, candidato) }))
    .filter((item) => item.distancia > 0 && item.distancia <= maxDist)
    .sort((a, b) => a.distancia - b.distancia || a.candidato.localeCompare(b.candidato, "pt-BR"));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const key = item.candidato.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item.candidato);
    if (out.length >= limite) {
      break;
    }
  }
  return out;
};

export const hintComProximos = (
  base: string,
  nome: string,
  candidatos: readonly string[],
): string => {
  const proximos = sugerirProximos(nome, candidatos);
  if (proximos.length > 0) {
    return `${base} Você quis dizer: ${proximos.join(", ")}?`;
  }
  const amostra = candidatos.slice(0, 8);
  if (amostra.length > 0) {
    return `${base} Disponíveis: ${amostra.join(", ")}.`;
  }
  return base;
};
