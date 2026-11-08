import { expect, it, vi } from "vitest";
import {
  KnowledgeGraphCache,
  orderedGraphItems,
} from "../../../src/application/persona-v2/knowledge-graph-cache.js";
import type { KnowledgeGraph } from "../../../src/domain/persona-v2/knowledge-context.js";
import { queryResponseBytes } from "../../../src/application/persona-v2/query-response-size.js";
import { binaryMedia } from "../../../src/application/persona-v2/binary-attachment.js";

it("grafo derivado limita reconstruções, isola chaves e não compartilha objetos mutáveis", () => {
  const cache = new KnowledgeGraphCache(10000, 2);
  const build = vi.fn(() => ({ nodes: [], edges: [], omittedRelationships: 1 }));
  const first = cache.get("persona:a:hash1", build);
  expect(cache.get("persona:a:hash1", build)).toEqual(first);
  expect(cache.get("persona:a:hash1", build)).not.toBe(first);
  expect(build).toHaveBeenCalledTimes(1);
  Object.assign(first, { omittedRelationships: 99 });
  expect(cache.get("persona:a:hash1", build).omittedRelationships).toBe(1);
  cache.get("persona:b:hash1", build);
  cache.get("persona:a:hash2", build);
  cache.get("persona:a:hash1", build);
  expect(build).toHaveBeenCalledTimes(4);
  const tiny = new KnowledgeGraphCache(1);
  tiny.get("key", build);
  tiny.get("key", build);
  expect(build).toHaveBeenCalledTimes(6);
});

it("página intercala nós e elos ordenados exatamente como a ordenação anterior", () => {
  const origin = { kind: "privado" as const, publicationId: "fixture", hash: "a".repeat(64) };
  const graph: KnowledgeGraph = {
    nodes: ["z", "a", "d"].map((id) => ({
      id,
      kind: "table",
      sourceId: "fixture",
      schema: null,
      table: id,
      meaning: "fixture",
      origin,
    })),
    edges: ["x", "b"].map((id) => ({
      id,
      from: "a",
      to: "d",
      sourceId: "fixture",
      keys: [],
      join: "inner",
      cardinality: "1:1",
      optional: false,
      meaning: "fixture",
      via: [],
      path: [],
      constraintStatus: null,
      origin,
    })),
    omittedRelationships: 0,
  };
  const sorted = new KnowledgeGraphCache().get("fixture", () => graph);
  expect(orderedGraphItems(sorted.nodes, sorted.edges).map((item) => item.value.id)).toEqual([
    "a",
    "b",
    "d",
    "x",
    "z",
  ]);
  expect(orderedGraphItems([], sorted.edges).map((item) => item.value.id)).toEqual(["b", "x"]);
  expect(graph.nodes.map((node) => node.id)).toEqual(["z", "a", "d"]);
});

it.each([false, true])(
  "mede bytes UTF-8 do envelope com uma serialização (reuse=%s)",
  (reusable) => {
    const response = {
      rows: [{ text: 'ação 😀 \\"', value: null }],
      completeness: { complete: true },
    };
    const expected = Buffer.byteLength(
      JSON.stringify(reusable ? { ...response, reuse: { kind: "singleflight" } } : response),
    );
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      const size = queryResponseBytes(response, reusable);
      expect(size).toBe(expected);
      expect(stringify).toHaveBeenCalledTimes(1);
    } finally {
      stringify.mockRestore();
    }
    expect(response).not.toHaveProperty("reuse");
  },
);

it("identifica assinatura em subarray sem copiar bytes nem ler fora da janela", () => {
  const original = new Uint8Array(Buffer.from("junk%PDF-1.4private"));
  const slice = original.subarray(4, 12);
  const from = vi.spyOn(Buffer, "from");
  try {
    expect(binaryMedia(slice, ["application/pdf"])).toEqual({
      mimeType: "application/pdf",
      extension: "pdf",
    });
    expect(from).toHaveBeenCalledWith(slice.buffer, slice.byteOffset, slice.byteLength);
    expect(from.mock.calls.some((args) => args[0] === slice)).toBe(false);
  } finally {
    from.mockRestore();
  }
  expect(Buffer.from(original).toString()).toBe("junk%PDF-1.4private");
  expect(() => binaryMedia(original.subarray(0, 4), ["application/pdf"])).toThrow();
});
