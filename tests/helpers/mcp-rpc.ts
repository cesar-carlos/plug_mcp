import request from "supertest";
import type { Express } from "express";

export const parseMcpPayload = (res: request.Response): Record<string, unknown> => {
  if (res.body && typeof res.body === "object" && Object.keys(res.body).length > 0) {
    return res.body as Record<string, unknown>;
  }
  const text = res.text ?? "";
  const dataLines = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  const last = dataLines.at(-1);
  if (last) {
    return JSON.parse(last) as Record<string, unknown>;
  }
  if (text.trim().startsWith("{")) {
    return JSON.parse(text) as Record<string, unknown>;
  }
  return { raw: text, status: res.status, headers: res.headers };
};

export const mcpRpc = async (
  app: Express,
  token: string,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ res: request.Response; payload: Record<string, unknown>; sessionId?: string }> => {
  const req = request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json");
  if (sessionId) {
    req.set("mcp-session-id", sessionId);
  }
  const res = await req.send(body);
  return {
    res,
    payload: parseMcpPayload(res),
    sessionId: res.headers["mcp-session-id"],
  };
};

export const payloadText = (payload: Record<string, unknown>): string => JSON.stringify(payload);

export const toolJson = (payload: Record<string, unknown>): Record<string, unknown> => {
  const result = payload.result as { content?: { text?: string }[] } | undefined;
  const text = result?.content?.[0]?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { text };
    }
  }
  return payload;
};

export const requireToolOk = (
  payload: Record<string, unknown>,
  tool: string,
): Record<string, unknown> => {
  const result = payload.result as { isError?: boolean } | undefined;
  const json = toolJson(payload);
  const error = json.error as { code?: string; message?: string; hint?: string } | undefined;
  if (result?.isError === true || json.success === false) {
    throw new Error(
      `${tool} falhou: ${error?.code ?? "UNKNOWN"} — ${error?.message ?? payloadText(json)}${error?.hint ? ` hint=${error.hint}` : ""}`,
    );
  }
  return json;
};

export const readToolResult = (
  payload: Record<string, unknown>,
):
  | { ok: true; json: Record<string, unknown> }
  | {
      ok: false;
      json: Record<string, unknown>;
      error?: { code?: string; message?: string; hint?: string };
    } => {
  const result = payload.result as { isError?: boolean } | undefined;
  const json = toolJson(payload);
  const error = json.error as { code?: string; message?: string; hint?: string } | undefined;
  if (result?.isError === true || json.success === false) {
    return { ok: false, json, error };
  }
  return { ok: true, json };
};
