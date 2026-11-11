import { effectScope } from "vue";
import { expect, it, vi } from "vitest";
import { useFederationSkillEditor } from "./use-federation-skill-editor";

it.each([false, true])("carrega publicações sem rajada ou retry; falha=%s", async (fail) => {
  let active = 0;
  let peak = 0;
  let reads = 0;
  const scope = effectScope();
  const api = async <T>(url: string): Promise<T> => {
    if (url.endsWith("/skills"))
      return {
        skills: Array.from({ length: 25 }, (_, i) => ({
          id: String(i),
          kind: "consulta",
          activePublicationId: String(i),
        })),
      } as T;
    reads++;
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    if (fail) throw new Error("Falha temporária. Atendimento: fixture-support-id");
    return { publication: null } as T;
  };
  const panel = scope.run(() =>
    useFederationSkillEditor(
      {
        api,
        base: "/api/admin/personas/fixture",
        sources: [],
        disabled: false,
        confirmDiscard: async () => true,
      },
      vi.fn(),
    ),
  )!;
  await vi.waitFor(() => expect(panel.busy.value).toBe(false));
  expect(peak).toBe(1);
  expect(reads).toBe(fail ? 1 : 25);
  expect(panel.publications.value).toEqual([]);
  expect(panel.error.value).toBe(fail ? "Falha temporária. Atendimento: fixture-support-id" : "");
  scope.stop();
});
