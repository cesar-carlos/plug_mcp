import { AsyncLocalStorage } from "node:async_hooks";

export const accountContext = new AsyncLocalStorage<string | undefined>();

export const currentAccountId = (): string | undefined => accountContext.getStore();
