import { AsyncLocalStorage } from "node:async_hooks";
import type { ConsumerAuth } from "../domain/entities/consumer-auth.js";

export interface SessionStore {
  readonly usuarioId?: string;
  readonly acessoId?: string;
  readonly clientIp?: string;
  readonly auth?: ConsumerAuth;
  readonly authorize?: () => Promise<void>;
  /** Somente casos de uso terminais podem marcar este contexto. */
  terminal?: boolean;
  readonly onComplete?: (() => void)[];
}

export const sessionContext = new AsyncLocalStorage<SessionStore>();

export const currentAccountId = (): string | undefined => sessionContext.getStore()?.usuarioId;

export const currentAcessoId = (): string | undefined => sessionContext.getStore()?.acessoId;

export const currentClientIp = (): string | undefined => sessionContext.getStore()?.clientIp;
export const currentConsumerAuth = (): ConsumerAuth | undefined => sessionContext.getStore()?.auth;
export const assertConsumerAuthorized = async (): Promise<void> => {
  await sessionContext.getStore()?.authorize?.();
};
