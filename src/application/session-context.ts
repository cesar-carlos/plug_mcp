import { AsyncLocalStorage } from "node:async_hooks";

export interface SessionStore {
  readonly usuarioId?: string;
  readonly acessoId?: string;
  readonly clientIp?: string;
}

export const sessionContext = new AsyncLocalStorage<SessionStore>();

export const currentAccountId = (): string | undefined => sessionContext.getStore()?.usuarioId;

export const currentAcessoId = (): string | undefined => sessionContext.getStore()?.acessoId;

export const currentClientIp = (): string | undefined => sessionContext.getStore()?.clientIp;
