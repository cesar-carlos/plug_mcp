import type { LogFields, LoggerPort } from "../../src/domain/ports/logger.port.js";

const REDACTED_KEYS = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "senha",
  "clientToken",
  "client_token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "authorization",
]);

const sanitize = (fields: LogFields = {}): LogFields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key) ? "[redacted]" : value,
    ]),
  );

/**
 * Logger mínimo para os testes "live" (tests/live/): só imprime no console, mas segue a mesma
 * lista de redact do PinoLoggerAdapter (security.mdc) — nunca imprime token/senha bruto mesmo em
 * teste manual contra o plug-server real.
 */
export class ConsoleTestLogger implements LoggerPort {
  constructor(private readonly prefix = "[live]") {}

  info(message: string, fields?: LogFields): void {
    console.log(this.prefix, message, sanitize(fields));
  }

  warn(message: string, fields?: LogFields): void {
    console.warn(this.prefix, message, sanitize(fields));
  }

  error(message: string, fields?: LogFields): void {
    console.error(this.prefix, message, sanitize(fields));
  }

  child(fields: LogFields): LoggerPort {
    return new ConsoleTestLogger(`${this.prefix} ${JSON.stringify(sanitize(fields))}`);
  }
}
