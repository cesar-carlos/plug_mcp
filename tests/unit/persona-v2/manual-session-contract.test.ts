import { expect, it } from "vitest";
import {
  createManualSession,
  fixtureSessionDeadline,
} from "../../../scripts/homologation/manual-session-contract.js";

const now = Date.parse("2026-10-22T12:00:00Z");
it("preserva o prazo curto de controladores automatizados sem opção manual", () => {
  expect(fixtureSessionDeadline({}, 12 * 60_000, now)).toBe(now + 12 * 60_000);
});
it("sessão manual fixa prazo explícito, sem renovação ao reler", () => {
  const manualTraining = createManualSession(60, now);
  expect(fixtureSessionDeadline({ manualTraining }, 12 * 60_000, now + 10_000)).toBe(
    now + 60 * 60_000,
  );
});
it("recusa prazo vencido, formato falso ou duração acima do teto", () => {
  for (const manualTraining of [
    { format: "persona-manual-training-v1", expiresAt: new Date(now).toISOString() },
    { format: "persona-manual-training-v1", expiresAt: new Date(now + 121 * 60_000).toISOString() },
    { format: "other", expiresAt: new Date(now + 60_000).toISOString() },
    { format: "persona-manual-training-v1", expiresAt: "invalid" },
  ])
    expect(() => fixtureSessionDeadline({ manualTraining }, 12 * 60_000, now)).toThrow();
  for (const minutes of [0, 9, 121, 10.5])
    expect(() => createManualSession(minutes, now)).toThrow();
});
