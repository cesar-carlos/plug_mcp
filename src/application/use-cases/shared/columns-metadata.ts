export interface ColumnMetadataItem {
  readonly name: string;
  readonly type: string | null;
  readonly nullable: boolean | null;
}

export interface ColumnMetadataHint {
  readonly type?: string | null;
  readonly nullable?: boolean | null;
}

export const hintsFromGrafoColunas = (
  colunas: readonly { nome: string; tipo: string | null; nullable: boolean | null }[],
): Map<string, ColumnMetadataHint> => {
  const map = new Map<string, ColumnMetadataHint>();
  for (const coluna of colunas) {
    const type = coluna.tipo?.trim() ? coluna.tipo : null;
    map.set(coluna.nome.toLowerCase(), { type, nullable: coluna.nullable });
  }
  return map;
};

export const mergeColumnHints = (
  into: Map<string, ColumnMetadataHint>,
  colunas: readonly { nome: string; tipo: string | null; nullable: boolean | null }[],
): void => {
  for (const [key, hint] of hintsFromGrafoColunas(colunas)) {
    if (!into.has(key)) {
      into.set(key, hint);
    }
  }
};

/** Hub primeiro; grafo/pacote depois; senão `null` nas chaves (cliente MCP exige o shape). */
export const normalizeColumnsMetadata = (
  columns: readonly string[],
  hub: readonly { name: string; type?: string | null; nullable?: boolean | null }[] | undefined,
  hints: ReadonlyMap<string, ColumnMetadataHint> = new Map(),
): ColumnMetadataItem[] => {
  const byHub = new Map<
    string,
    { name: string; type?: string | null; nullable?: boolean | null }
  >();
  for (const item of hub ?? []) {
    byHub.set(item.name.toLowerCase(), item);
  }
  const names = columns.length > 0 ? columns : [...byHub.values()].map((item) => item.name);
  return names.map((name) => {
    const key = name.toLowerCase();
    const hit = byHub.get(key);
    const hint = hints.get(key);
    return {
      name: hit?.name ?? name,
      type: typeof hit?.type === "string" ? hit.type : (hint?.type ?? null),
      nullable: typeof hit?.nullable === "boolean" ? hit.nullable : (hint?.nullable ?? null),
    };
  });
};
