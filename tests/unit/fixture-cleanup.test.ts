import { expect, it } from "vitest";
import { cleanupFixture } from "../../scripts/homologation/cleanup.js";

it("preserves the original failure and attempts all cleanup steps in order", async () => {
  const original = new Error("original assertion");
  const close = new Error("pool shutdown");
  const drop = new Error("database still in use");
  const calls: string[] = [];
  const result = cleanupFixture(
    [
      async () => {
        calls.push("pool");
        throw close;
      },
      async () => {
        calls.push("drop");
        throw drop;
      },
      async () => {
        calls.push("admin");
      },
    ],
    { error: original },
  );
  await expect(result).rejects.toMatchObject({ errors: [original, close, drop] });
  expect(calls).toEqual(["pool", "drop", "admin"]);
});

it("does not report success when cleanup alone fails", async () => {
  const failure = new Error("cleanup");
  await expect(
    cleanupFixture([
      async () => {
        throw failure;
      },
    ]),
  ).rejects.toMatchObject({
    errors: [failure],
  });
});
