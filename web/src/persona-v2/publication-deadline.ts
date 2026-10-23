export function publicationDeadline(value: string): string {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw new Error("Escolha um prazo futuro de revisão da publicação.");
  }
  return date.toISOString();
}
