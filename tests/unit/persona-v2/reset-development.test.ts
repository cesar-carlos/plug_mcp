import { describe, expect, it } from "vitest";
import { validateDevelopmentReset } from "../../../src/infrastructure/persistence/persona-v2/reset-development.js";

const valid = {
  databaseUrl: "postgres://fixture:fixture@127.0.0.1:5432/persona_v2_isolated_test",
  environment: "test",
  generation: "persona-v2",
  confirmDatabase: "persona_v2_isolated_test",
  apply: false,
};
describe("development reset target", () => {
  it("accepts only explicit local disposable target", () => {
    expect(validateDevelopmentReset(valid)).toBe(valid.confirmDatabase);
  });
  it.each([
    { environment: "production" },
    { environment: "" },
    { generation: "legacy" },
    { confirmDatabase: "other" },
    { databaseUrl: "" },
    { databaseUrl: "postgres://fixture@remote.example/persona_v2_isolated_test" },
    { databaseUrl: "postgres://fixture@localhost/persona_v2_isolated_test?host=remote.example" },
    { databaseUrl: "postgres://fixture@localhost/postgres", confirmDatabase: "postgres" },
    {
      databaseUrl: "postgres://fixture@localhost/plug_server_test",
      confirmDatabase: "plug_server_test",
    },
    {
      databaseUrl: "postgres://fixture@localhost/persona_v2_production",
      confirmDatabase: "persona_v2_production",
    },
  ])("refuses unsafe or incomplete target: %j", (change) => {
    expect(() => validateDevelopmentReset({ ...valid, ...change })).toThrow();
  });
});
