import { AsyncLocalStorage } from "node:async_hooks";

export interface AccountStore {
  readonly usuarioId?: string;
  readonly clientIp?: string;
}

export const accountContext = new AsyncLocalStorage<AccountStore>();

export const currentAccountId = (): string | undefined => accountContext.getStore()?.usuarioId;

export const currentClientIp = (): string | undefined => accountContext.getStore()?.clientIp;
