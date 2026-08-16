import type { LogFields, LoggerPort } from "../../src/domain/ports/logger.port.js";

export class SilentTestLogger implements LoggerPort {
  readonly warnings: { message: string; fields?: LogFields }[] = [];

  info(_message: string, _fields?: LogFields): void {
    return;
  }

  warn(message: string, fields?: LogFields): void {
    this.warnings.push({ message, fields });
  }

  error(_message: string, _fields?: LogFields): void {
    return;
  }

  child(_fields: LogFields): LoggerPort {
    return this;
  }
}
