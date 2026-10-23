import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { validatePersonaProductionConfiguration } from "../../../src/config/persona-production.js";

const valid = {
  PERSONA_V2_PRODUCTION_IMAGE: `ghcr.io/fixture/persona@sha256:${"a".repeat(64)}`,
  PERSONA_V2_PRODUCTION_PUBLIC_URL: "https://persona.example.test",
  PERSONA_V2_PRODUCTION_HUB_URL: "https://hub.example.test",
  PERSONA_V2_PRODUCTION_DATABASE_URL: "postgres://fixture:fixture@database/se7e_persona_v2",
  PERSONA_V2_PRODUCTION_ENCRYPTION_KEY: "a123456789bcdef0".repeat(4),
  PERSONA_V2_PRODUCTION_ENCRYPTION_KEY_ID: "fixture-key",
  PERSONA_V2_PRODUCTION_LOCAL_PORT: "3335",
};
describe("production distribution preparation", () => {
  it("validates explicit configuration without granting release", () => {
    expect(() => validatePersonaProductionConfiguration(valid)).not.toThrow();
  });
  it.each(Object.keys(valid))("refuses missing %s", (key) => {
    expect(() => validatePersonaProductionConfiguration({ ...valid, [key]: undefined })).toThrow();
  });
  it.each([
    { PERSONA_V2_PRODUCTION_IMAGE: "ghcr.io/fixture/persona:latest" },
    { PERSONA_V2_PRODUCTION_DATABASE_URL: "postgres://fixture:fixture@database/postgres" },
    { PERSONA_V2_PRODUCTION_DATABASE_URL: "postgres://fixture:fixture@database/plug_server" },
    { PERSONA_V2_PRODUCTION_DATABASE_URL: "postgres://fixture@database/se7e_persona_v2" },
    { PERSONA_V2_PRODUCTION_PUBLIC_URL: "http://persona.example.test" },
    { PERSONA_V2_PRODUCTION_HUB_URL: "https://secret@hub.example.test/path" },
    { PERSONA_V2_PRODUCTION_ENCRYPTION_KEY: "0123456789abcdef".repeat(4) },
    { PERSONA_V2_PRODUCTION_ENCRYPTION_KEY: "a".repeat(64) },
    { PERSONA_V2_PRODUCTION_LOCAL_PORT: "70000" },
  ])("refuses unsafe configuration %j", (change) => {
    expect(() => validatePersonaProductionConfiguration({ ...valid, ...change })).toThrow();
  });
  it("keeps production separate with no build, storage provisioning or automatic restart", () => {
    const doc = parse(readFileSync("docker-compose.persona-v2.production.yml", "utf8"), {
      merge: true,
    }) as {
      name: string;
      services: Record<
        string,
        {
          build?: unknown;
          restart: string;
          entrypoint: string[];
          read_only: boolean;
          ports?: string[];
          volumes?: unknown;
          environment: Record<string, string>;
        }
      >;
    };
    expect(doc.name).toBe("se7e-persona-v2-production");
    expect(Object.keys(doc.services).sort()).toEqual(["migrate", "server", "worker"]);
    for (const service of Object.values(doc.services)) {
      expect(service.build).toBeUndefined();
      expect(service.volumes).toBeUndefined();
      expect(service.restart).toBe("no");
      expect(service.read_only).toBe(true);
      expect(service.entrypoint).toEqual(["./docker-entrypoint-persona-v2.sh"]);
      expect(service.environment.NODE_ENV).toBe("production");
      expect(service.environment.DATABASE_URL).toContain("PRODUCTION_DATABASE_URL:?");
    }
    expect(doc.services.server!.ports?.[0]).toMatch(/^127\.0\.0\.1:/);
    expect(doc.services.worker!.ports).toBeUndefined();
  });
});
