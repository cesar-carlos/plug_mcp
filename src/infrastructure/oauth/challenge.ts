/** Texto fixo: não inclui mensagens do hub, credenciais ou dados do negócio. */
export const chatGptOAuthChallenge = (publicBaseUrl: string, invalidToken = false): string => {
  const metadata = new URL("/.well-known/oauth-protected-resource/mcp/chatgpt", publicBaseUrl);
  const quote = (value: string): string => `"${value.replace(/["\\]/g, "\\$&")}"`;
  return `Bearer resource_metadata=${quote(metadata.toString())}${
    invalidToken
      ? ', error="invalid_token", error_description="Reconecte o Se7e para continuar."'
      : ""
  }`;
};
