import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  createRateLimiter,
  MemoryRateLimitStore,
} from "../../src/infrastructure/http/rate-limit.js";

const fakeReq = (ip: string): Request => ({ ip }) as unknown as Request;

const fakeRes = (): Response => {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value;
      return res;
    }),
    json: vi.fn((_body: unknown) => res),
  };
  return res as unknown as Response;
};

const invoke = async (
  limiter: ReturnType<typeof createRateLimiter>,
  req: Request,
  res: Response,
  next: ReturnType<typeof vi.fn>,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const wrappedNext: NextFunction = ((err?: unknown) => {
      if (err !== undefined) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      next();
      resolve();
    }) as NextFunction;
    (res.json as ReturnType<typeof vi.fn>).mockImplementation((_body: unknown) => {
      resolve();
      return res;
    });
    limiter(req, res, wrappedNext);
  });
};

describe("createRateLimiter", () => {
  it("permite requisições dentro do limite e bloqueia acima dele", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const next = vi.fn();
    const res = fakeRes();

    await invoke(limiter, fakeReq("1.2.3.4"), res, next);
    await invoke(limiter, fakeReq("1.2.3.4"), res, next);
    expect(next).toHaveBeenCalledTimes(2);

    await invoke(limiter, fakeReq("1.2.3.4"), res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("mantém contadores independentes por chave (IP)", async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const next = vi.fn();
    const res = fakeRes();

    await invoke(limiter, fakeReq("1.1.1.1"), res, next);
    await invoke(limiter, fakeReq("2.2.2.2"), res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe("MemoryRateLimitStore", () => {
  it("libera novamente após a janela expirar", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const store = new MemoryRateLimitStore();

    expect((await store.hit("k", 1_000, 1)).allowed).toBe(true);
    expect((await store.hit("k", 1_000, 1)).allowed).toBe(false);

    now.mockReturnValue(2_001);
    expect((await store.hit("k", 1_000, 1)).allowed).toBe(true);
    now.mockRestore();
  });
});
