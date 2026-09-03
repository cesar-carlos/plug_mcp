/** Maps DB `acesso_id`. NULL/blank is not a tenant — never coalesce to "". */
export const asAcessoId = (value: string | null): string | null =>
  value != null && value !== "" ? value : null;

/** Fail-closed tenant match: empty/null never groups catalog rows. */
export const mesmoAcessoCatalogo = (rowAcessoId: string | null, acessoId: string): boolean =>
  asAcessoId(acessoId) !== null && rowAcessoId === acessoId;
