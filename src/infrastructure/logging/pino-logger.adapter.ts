import pino, { type Logger as PinoLogger } from "pino";
import type { LogFields, LoggerPort } from "../../domain/ports/logger.port.js";

export class PinoLoggerAdapter implements LoggerPort {
  constructor(private readonly logger: PinoLogger) {}

  info(message: string, fields?: LogFields): void {
    this.logger.info(fields ?? {}, message);
  }

  warn(message: string, fields?: LogFields): void {
    this.logger.warn(fields ?? {}, message);
  }

  error(message: string, fields?: LogFields): void {
    this.logger.error(fields ?? {}, message);
  }

  child(fields: LogFields): LoggerPort {
    return new PinoLoggerAdapter(this.logger.child(fields));
  }
}

export const createPino = (level: string, pretty: boolean): PinoLogger =>
  pino({
    level,
    redact: {
      paths: [
        "password",
        "password_hash",
        "passwordHash",
        "clientToken",
        "client_token",
        "tokenMcp",
        "token_mcp",
        "setupCode",
        "setup_code",
        "password",
        "accessToken",
        "access_token",
        "refreshToken",
        "refresh_token",
        "authorization",
        "*.password",
        "*.password_hash",
        "*.passwordHash",
        "*.clientToken",
        "*.client_token",
        "*.accessToken",
        "*.access_token",
        "*.refreshToken",
        "*.refresh_token",
        "req.headers.authorization",
        "req.headers.cookie",
      ],
      censor: "[redacted]",
    },
    transport: pretty
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
  });
