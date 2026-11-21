import { expect, it, vi } from "vitest";
import { PdfRenderSlot } from "../../../src/infrastructure/persona-v2/pdf-render-slot.js";

it("does not admit another worker until termination completes", async () => {
  const slot = new PdfRenderSlot();
  expect(slot.acquire()).toBe(true);
  let finish!: () => void;
  const terminate = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = slot.releaseAfter(terminate);
  const respond = vi.fn();
  const delivered = pending.then(respond);
  expect(slot.acquire()).toBe(false);
  expect(respond).not.toHaveBeenCalled();
  finish();
  await pending;
  await delivered;
  expect(respond).toHaveBeenCalledTimes(1);
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(slot.acquire()).toBe(true);
  expect(slot.acquire()).toBe(false);
});

it("fails closed if termination cannot be confirmed", async () => {
  const slot = new PdfRenderSlot();
  expect(slot.acquire()).toBe(true);
  await slot.releaseAfter(() => Promise.reject(new Error("synthetic termination failure")));
  expect(slot.acquire()).toBe(false);
});

it("releases a slot when construction produced no worker", async () => {
  const slot = new PdfRenderSlot();
  expect(slot.acquire()).toBe(true);
  await slot.releaseAfter(() => Promise.resolve());
  expect(slot.acquire()).toBe(true);
});
