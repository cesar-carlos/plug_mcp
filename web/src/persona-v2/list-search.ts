/** Local display filtering only: never changes selection, grants or stored drafts. */
export function matchesSearch(query: string, ...values: string[]): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const text = normalize(values.join(" "));
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
