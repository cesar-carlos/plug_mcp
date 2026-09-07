import { sessionContext } from "../../src/application/session-context.js";

export const withBound = <T>(
  usuarioId: string,
  acessoId: string,
  fn: () => Promise<T>,
): Promise<T> => sessionContext.run({ usuarioId, acessoId }, fn);
