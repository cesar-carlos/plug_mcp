import { expect, it } from "vitest";
import { tokenIssuanceBody, tokenRequestSize } from "./token-request-size";
import { emptyTokenPermissions } from "./token-permissions";
import { TOKEN_JSON_BYTES } from "../../../src/domain/persona-v2/admin-request-limits";

it("mede o mesmo corpo emitido, inclui UTF-8 e delegação sem mudar concessões", () => {
  const permissions = {
    ...emptyTokenPermissions(),
    skills: [
      {
        skillId: "synthetic",
        capabilities: ["á".repeat(100)],
        effects: [],
        requireHumanApproval: false,
      },
    ],
  };
  const input = { name: "Usuário", noExpiry: false, days: 30, canDelegate: false, permissions };
  const body = tokenIssuanceBody(input, 0);
  const delegated = tokenIssuanceBody({ ...input, canDelegate: true }, 0);
  const size = tokenRequestSize(body),
    larger = tokenRequestSize(delegated);
  expect(body.expiresAt).toBe("1970-01-31T00:00:00.000Z");
  expect(size.bytes).toBe(new TextEncoder().encode(JSON.stringify(body)).byteLength);
  expect(size.bytes).toBeGreaterThan(JSON.stringify(body).length);
  expect(larger.bytes - size.bytes).toBe(larger.delegationBytes - size.delegationBytes);
  expect(body.permissions).toEqual(delegated.permissions);
  expect(delegated.delegation).toEqual(permissions);
});
it("avisa perto de 80%, permite o teto e bloqueia um byte a mais", () => {
  const body = tokenIssuanceBody(
    {
      name: "",
      noExpiry: true,
      days: 30,
      canDelegate: false,
      permissions: emptyTokenPermissions(),
    },
    0,
  );
  const overhead = tokenRequestSize(body).bytes;
  expect(
    tokenRequestSize({ ...body, name: "a".repeat(Math.ceil(TOKEN_JSON_BYTES * 0.8) - overhead) })
      .nearLimit,
  ).toBe(true);
  expect(
    tokenRequestSize({ ...body, name: "a".repeat(TOKEN_JSON_BYTES - overhead) }).exceeded,
  ).toBe(false);
  expect(
    tokenRequestSize({ ...body, name: "a".repeat(TOKEN_JSON_BYTES - overhead + 1) }).exceeded,
  ).toBe(true);
});
