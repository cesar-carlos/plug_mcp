import { assertConsumerAuthorized } from "../../application/session-context.js";
import type { PlugServerGatewayPort } from "../../domain/ports/plug-server-gateway.port.js";
import { assertOutsideAuthorizedTransaction } from "../persistence/authorized-unit-of-work.js";

/** Toda chamada ao hub ocorre após a verificação da concessão corrente. */
export const consumerAuthorizedGateway = (gateway: PlugServerGatewayPort): PlugServerGatewayPort =>
  new Proxy(gateway, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]): Promise<unknown> => {
        assertOutsideAuthorizedTransaction();
        await assertConsumerAuthorized();
        return Reflect.apply(value, target, args) as Promise<unknown>;
      };
    },
  });
