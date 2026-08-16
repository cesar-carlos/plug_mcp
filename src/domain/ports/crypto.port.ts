export interface PasswordHasherPort {
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
}

export interface TokenEncryptorPort {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
  randomId(): string;
  sha256Hex(value: string): string;
}

export interface CryptoPort extends PasswordHasherPort, TokenEncryptorPort {}
