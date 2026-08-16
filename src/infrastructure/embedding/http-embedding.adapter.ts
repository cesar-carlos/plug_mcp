import type { EmbeddingPort } from "../../domain/ports/embedding.port.js";

interface EmbeddingApiResponse {
  data?: { embedding?: unknown }[];
}

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

export class HttpEmbeddingAdapter implements EmbeddingPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    readonly dimensions: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async embed(text: string): Promise<readonly number[]> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/embeddings`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey.length > 0) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!response.ok) {
      throw new Error("embedding request failed");
    }
    const body = (await response.json()) as EmbeddingApiResponse;
    const embedding = body.data?.[0]?.embedding;
    if (!isNumberArray(embedding) || embedding.length !== this.dimensions) {
      throw new Error("embedding response invalid");
    }
    return embedding;
  }
}
