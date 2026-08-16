export interface EmbeddingPort {
  readonly dimensions: number;
  embed(text: string): Promise<readonly number[]>;
}
