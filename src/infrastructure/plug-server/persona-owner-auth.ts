import type {
  HubOwnerProfile,
  OwnerAuthenticationPort,
} from "../../domain/ports/persona-v2.port.js";
import type { PlugServerRestAdapter } from "./plug-server-rest.adapter.js";

export class PersonaOwnerAuthentication implements OwnerAuthenticationPort {
  readonly hubOrigin: string;
  constructor(
    baseUrl: string,
    private readonly hub: PlugServerRestAdapter,
  ) {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Origem do hub precisa ser canônica.");
    }
    this.hubOrigin = url.origin;
  }
  login(email: string, password: string): Promise<{ accessToken: string }> {
    return this.hub.login(email, password);
  }
  profile(accessToken: string): Promise<HubOwnerProfile> {
    return this.hub.getClientProfile(accessToken);
  }
}
