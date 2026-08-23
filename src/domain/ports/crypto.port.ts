export interface CryptoPort {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
  randomId(): string;
  randomToken(bytes?: number): string;
  sha256Hex(value: string): string;
}
