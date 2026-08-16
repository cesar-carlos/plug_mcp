export const DIALETOS = ["mssql", "sybase", "postgres", "firebird"] as const;

export type Dialeto = (typeof DIALETOS)[number];

export const isDialeto = (value: string): value is Dialeto =>
  (DIALETOS as readonly string[]).includes(value);
