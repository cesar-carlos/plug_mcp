import { expect, it } from "vitest";
import {
  parseIntegrationSetup,
  integrationRegistrationSchema,
} from "../../../src/domain/persona-v2/integration-credential.js";
const registration = { name: "Fixture", kind: "rest", destination: "https://api.example.com/v1" };
it("aceita somente credenciais tipadas e confirmação explícita", () => {
  for (const credential of [
    { credentialType: "bearer", token: "fixture-only" },
    { credentialType: "api_key", header: "X-Api-Key", apiKey: "fixture-only" },
    { credentialType: "basic", username: "fixture", password: "fixture-only" },
  ]) {
    expect(
      parseIntegrationSetup({ ...registration, ...credential, confirmed: "save" }, true),
    ).toEqual({ registration, credential });
    expect(parseIntegrationSetup({ ...credential, confirmed: "save" }, false).credential).toEqual(
      credential,
    );
    expect(() =>
      parseIntegrationSetup({ ...registration, ...credential, confirmed: "save" }, false),
    ).toThrow();
    expect(() => parseIntegrationSetup({ ...credential }, false)).toThrow();
  }
});
it("recusa destino inseguro, segredos na URL e headers de transporte", () => {
  for (const destination of [
    "http://api.example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://host.internal",
    "https://user:secret@api.example.com",
    "https://api.example.com?key=secret",
    "https://api.example.com/#secret",
    "https://api.example.com:8080",
  ]) {
    expect(() => integrationRegistrationSchema.parse({ ...registration, destination })).toThrow();
  }
  for (const header of [
    "Authorization",
    "Host",
    "Cookie",
    "Content-Length",
    "X-Forwarded-For",
    "Sec-Fetch-Site",
    "X-Key\r\nHost",
  ]) {
    expect(() =>
      parseIntegrationSetup(
        { credentialType: "api_key", header, apiKey: "fixture", confirmed: "save" },
        false,
      ),
    ).toThrow();
  }
  expect(() =>
    parseIntegrationSetup(
      { credentialType: "bearer", token: "fixture\r\nInjected", confirmed: "save" },
      false,
    ),
  ).toThrow();
  expect(() =>
    parseIntegrationSetup(
      { credentialType: "bearer", token: "fixture", password: "unexpected", confirmed: "save" },
      false,
    ),
  ).toThrow();
});
