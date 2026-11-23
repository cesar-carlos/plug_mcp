import { expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import QueryTablesFields from "./QueryTablesFields.vue";
import { emptyTraining } from "./model";
it.each([false, true])(
  "editor mantém grão obrigatório fora do modo EXISTS: %s",
  async (existenceOnly) => {
    const training = emptyTraining();
    training.tables = [
      {
        name: "parcels",
        meaning: "Parcelas",
        grain: [],
        ...(existenceOnly ? { existenceOnly: true as const } : {}),
      },
    ];
    const html = await renderToString(
      createSSRApp({ render: () => h(QueryTablesFields, { modelValue: training }) }),
    );
    expect(html).toContain("Somente verificar existência");
    if (existenceOnly) {
      expect(html).not.toContain('placeholder="id"');
      expect(html).toContain("Não permite listar campos");
    } else expect(html).toMatch(/placeholder="id"[^>]*required/);
  },
);
