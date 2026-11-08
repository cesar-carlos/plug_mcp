import type { KnowledgeGraph } from "../../domain/persona-v2/knowledge-context.js";

/** Derived metadata only. Caller must revalidate authority and snapshot integrity before every get. */
export class KnowledgeGraphCache {
  private readonly entries = new Map<string, string>();
  private bytes = 0;
  constructor(
    private readonly maxBytes = 8 * 1024 * 1024,
    private readonly maxEntries = 64,
  ) {}
  get(key: string, build: () => KnowledgeGraph): KnowledgeGraph {
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return JSON.parse(hit) as KnowledgeGraph;
    }
    const built = build();
    const compare = (a: { id: string }, b: { id: string }) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const graph = {
      ...built,
      nodes: [...built.nodes].sort(compare),
      edges: [...built.edges].sort(compare),
    };
    const serialized = JSON.stringify(graph),
      size = Buffer.byteLength(serialized);
    if (size <= this.maxBytes && this.maxEntries > 0) {
      while (
        this.entries.size &&
        (this.bytes + size > this.maxBytes || this.entries.size >= this.maxEntries)
      ) {
        const oldest = this.entries.keys().next().value!;
        this.bytes -= Buffer.byteLength(this.entries.get(oldest)!);
        this.entries.delete(oldest);
      }
      this.entries.set(key, serialized);
      this.bytes += size;
    }
    return graph;
  }
}

/** Both inputs are already ordered in the verified derived graph. Filters preserve that order. */
export function orderedGraphItems(
  nodes: KnowledgeGraph["nodes"],
  edges: KnowledgeGraph["edges"],
): (
  | { type: "node"; value: KnowledgeGraph["nodes"][number] }
  | { type: "edge"; value: KnowledgeGraph["edges"][number] }
)[] {
  const items: (
    | { type: "node"; value: KnowledgeGraph["nodes"][number] }
    | { type: "edge"; value: KnowledgeGraph["edges"][number] }
  )[] = [];
  let n = 0,
    e = 0;
  while (n < nodes.length || e < edges.length) {
    if (n < nodes.length && (e >= edges.length || nodes[n]!.id <= edges[e]!.id))
      items.push({ type: "node", value: nodes[n++]! });
    else items.push({ type: "edge", value: edges[e++]! });
  }
  return items;
}
