export type LogFields = Record<string, unknown>;

export interface LoggerPort {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): LoggerPort;
}
