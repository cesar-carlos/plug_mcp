export interface QuerySingleflightOptions<T> {
  /** Persiste o resultado antes de liberar a lease distribuída. */
  onLeaderResult?: (value: T) => Promise<void>;
  /** Lê o resultado publicado pelo líder após a lease remota ser liberada. */
  readShared?: () => Promise<T | undefined>;
  /** Nunca espera além do orçamento da consulta que está aguardando. */
  waitMs?: number;
}

export interface QuerySingleflightPort {
  run<T>(
    key: string,
    operation: () => Promise<T>,
    options?: QuerySingleflightOptions<T>,
  ): Promise<{ value: T; role: "leader" | "waiter"; waitMs: number }>;
}
