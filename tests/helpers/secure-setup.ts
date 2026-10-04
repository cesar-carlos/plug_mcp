import request from "supertest";
import type { Express } from "express";
import { vi } from "vitest";
import type { ToolUseCases } from "../../src/infrastructure/mcp/register-tools.js";

export const completeBrowserSetup = async (
  app: Express,
  setupUrl: string,
  form: Record<string, string>,
  origin = "http://127.0.0.1:3333",
): Promise<{ token?: string; response: request.Response }> => {
  const path = new URL(setupUrl).pathname;
  const page = await request(app).get(path);
  const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)?.[1];
  if (!csrf) {
    throw new Error(`Setup form unavailable (${page.status})`);
  }
  const response = await request(app)
    .post(path)
    .set("Origin", origin)
    .type("form")
    .send({ ...form, csrf, confirmado: "sim" });
  return { token: /<pre>([^<]+)<\/pre>/.exec(response.text)?.[1], response };
};

export const registerAccessViaBrowser = async (
  app: Express,
  useCases: ToolUseCases,
  form: Record<string, string>,
  setupUrl?: string,
): Promise<{ token: string; usuarioId: string; acessoId: string }> => {
  const spy = vi.spyOn(useCases.registrarAcesso, "execute");
  try {
    const url = setupUrl ?? (await useCases.setupOperations!.begin("registrar")).setupUrl;
    const completed = await completeBrowserSetup(app, url, form);
    if (!completed.token || completed.response.status !== 200) {
      throw new Error(`Browser setup failed (${completed.response.status})`);
    }
    const call = spy.mock.results[0];
    if (call?.type !== "return") {
      throw new Error("Registration not completed");
    }
    const result = await call.value;
    return { token: completed.token, usuarioId: result.usuarioId, acessoId: result.acessoId };
  } finally {
    spy.mockRestore();
  }
};
