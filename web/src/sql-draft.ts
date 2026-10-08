export interface SqlDraftRow {
  readonly id: string;
  readonly sqlModelo: string;
}

export interface SqlDraftState {
  readonly sql: string;
  readonly confirmado: boolean;
}

export interface SqlDraft extends SqlDraftRow, SqlDraftState {
  readonly original: string;
}

export const mesclarSqlDrafts = <T extends SqlDraftRow>(
  rows: readonly T[],
  previous: readonly (T & SqlDraftState)[],
  savedId: string,
): (T & SqlDraft)[] => {
  const byId = new Map(previous.map((item) => [item.id, item]));
  return rows.map((row) => {
    const prev = byId.get(row.id);
    if (!prev || row.id === savedId) {
      return { ...row, original: row.sqlModelo, sql: row.sqlModelo, confirmado: false };
    }
    return { ...row, original: row.sqlModelo, sql: prev.sql, confirmado: prev.confirmado };
  });
};
