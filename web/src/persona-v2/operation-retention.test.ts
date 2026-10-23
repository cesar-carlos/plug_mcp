import { expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import OperationRetentionNotice from "./OperationRetentionNotice.vue";

it("ausência de marcadores não inventa remoção, resultado ou conclusão", async () => {
  const html = await renderToString(createSSRApp({ render: () => h(OperationRetentionNotice) }));
  expect(html).not.toContain('role="status"');
  expect(html).not.toContain("removido");
});
it("mostra expiração separada de estado e proíbe inferir autorização de reenvio", async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(OperationRetentionNotice, {
          retention: {
            terminalAt: "2026-07-01T12:00:00Z",
            payloadPurgedAt: "2026-07-02T12:00:00Z",
            receiptPurgedAt: "2026-10-01T12:00:00Z",
          },
        }),
    }),
  );
  expect(html).toContain("dados operacionais foram removidos");
  expect(html).toContain("comprovante foi removido");
  expect(html).toContain("não autoriza reenviar");
  expect(html.match(/role="status"/g)).toHaveLength(2);
});
