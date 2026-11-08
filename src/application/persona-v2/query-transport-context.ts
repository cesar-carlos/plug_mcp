import { AsyncLocalStorage } from "node:async_hooks";

/** Request-local scheduling only; never a substitute for authorization. */
export const queryTransportContext = new AsyncLocalStorage<{
  readonly personaId: string;
  readonly signal: AbortSignal;
}>();
