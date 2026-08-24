import type { UsuarioPlugSessionPort } from "../../src/domain/ports/plug-server-gateway.port.js";

export const stubSessions = (
  accessToken = "access-test",
): UsuarioPlugSessionPort => ({
  getAccessToken: async () => accessToken,
  invalidate: () => undefined,
  remember: () => undefined,
});
