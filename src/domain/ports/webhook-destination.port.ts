export interface WebhookDestinationPort {
  validate(value: string): Promise<URL>;
  resolve(url: URL): Promise<{ address: string; family: 4 | 6 }>;
}
