import { expect, it } from "vitest";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { publicationCliFailure } from "../../../src/infrastructure/persistence/persona-v2/publication-cli-error.js";

it("informa o código confiável sem serializar SQL, credenciais ou promessa de retry", () => {
  const secret = "synthetic_SQL_and_credentials_never_print";
  for (const error of [
    new PersonaV2Error("AUTHORIZATION_DENIED", secret, {
      source: "client_token_rpc",
      hint: secret,
    }),
    new DomainError({
      code: "QUERY_TIMEOUT",
      message: secret,
      hint: secret,
      retryable: true,
      details: { source: secret },
    }),
  ]) {
    const failure = publicationCliFailure(error);
    expect(failure).toMatchObject({ approved: false, code: error.code, repeatAllowed: false });
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(failure.message).toContain("não repita efeitos incertos");
  }
});
it("não confia em código arbitrário de erro externo", () => {
  for (const error of [new Error("synthetic secret"), { code: "synthetic secret" }, null]) {
    expect(publicationCliFailure(error)).toMatchObject({
      approved: false,
      code: "RUNNER_FAILED",
      repeatAllowed: false,
    });
    expect(JSON.stringify(publicationCliFailure(error))).not.toContain("synthetic secret");
  }
});
it("expõe somente origem conhecida e prazo numérico limitado, sem autorizar repetição", () => {
  const error = new DomainError({
    code: "RATE_LIMITED",
    message: "private",
    hint: "private",
    source: "plug_server_http",
    retryAfterMs: 60000,
    retryable: true,
  });
  expect(publicationCliFailure(error)).toMatchObject({
    source: "plug_server_http",
    retryAfterMs: 60000,
    repeatAllowed: false,
  });
  for (const retryAfterMs of [-1, NaN, Infinity, 86_400_001]) {
    const unsafe = new DomainError({
      code: "RATE_LIMITED",
      message: "private",
      hint: "private",
      source: "synthetic_secret",
      retryAfterMs,
    });
    expect(publicationCliFailure(unsafe)).not.toHaveProperty("source");
    expect(publicationCliFailure(unsafe)).not.toHaveProperty("retryAfterMs");
  }
});
