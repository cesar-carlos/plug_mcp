import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Capture real Pino stdout in an isolated process: no mock of LoggerPort or redaction.
describe("diagnósticos com o logger de produção", () => {
  it("registra apenas categorias enumeradas de agregação com o supportId", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import {createPino,PinoLoggerAdapter} from './src/infrastructure/logging/pino-logger.adapter.ts';
      import {reportPersonaV2ToolError} from './src/infrastructure/mcp/persona-v2-tool-error.ts';
      import {DomainError} from './src/domain/errors/domain-error.ts';
      const logger=new PinoLoggerAdapter(createPino('warn',false));
      const reasons=['invalid_declared_grain','join_grain_unproven','relationship_unproven','measure_multiplication','sensitive-unknown', {sql:'sensitive-object'}];
      const ids=reasons.map(aggregationReason => reportPersonaV2ToolError(DomainError.pacote({code:'AGREGACAO_INSEGURA',message:'sensitive-message',hint:'sensitive-hint',details:{aggregationReason,sql:'sensitive-query',table:'sensitive-table',token:'sensitive-token'}}),logger).supportId);
      reportPersonaV2ToolError(new DomainError({code:'AGREGACAO_INSEGURA',source:'plug_server_http',message:'sensitive-upstream',hint:'sensitive-hint',details:{aggregationReason:'measure_multiplication'}}),logger);
      console.log(JSON.stringify({ids}));
    `,
      ],
      { encoding: "utf8" },
    );
    expect(output).not.toContain("sensitive-");
    const lines = output
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const events = lines.filter((line) => line.msg === "persona-v2 tool failed");
    const ids = lines.find((line) => line.ids).ids;
    expect(events).toHaveLength(7);
    expect(events.slice(0, 4).map((event) => event.aggregationReason)).toEqual([
      "invalid_declared_grain",
      "join_grain_unproven",
      "relationship_unproven",
      "measure_multiplication",
    ]);
    events.slice(0, 6).forEach((event, index) => {
      expect(event.supportId).toBe(ids[index]);
      expect(event.errorCode).toBe("AGREGACAO_INSEGURA");
      expect(event).not.toHaveProperty("details");
    });
    events.slice(4).forEach((event) => expect(event).not.toHaveProperty("aggregationReason"));
  });
  it("preserva errorCode/supportId e mantém códigos secretos e payloads protegidos", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import { createPino, PinoLoggerAdapter } from './src/infrastructure/logging/pino-logger.adapter.ts';
      import { reportPersonaV2ToolError } from './src/infrastructure/mcp/persona-v2-tool-error.ts';
      import { DomainError } from './src/domain/errors/domain-error.ts';
      import { PersonaV2Error } from './src/domain/persona-v2/model.ts';
      const logger = new PinoLoggerAdapter(createPino('warn', false));
      const errors = [
        new DomainError({code: 'PLUG_SERVER_ERROR', source: 'plug_server_http', stage: 'rpc',
          message: 'sensitive-upstream', hint: 'sensitive-hint', details: {
            rpcCode: -32602, reason: 'invalid_params', engineMessage: 'sensitive-sql', token: 'sensitive-token'}}),
        DomainError.pacote({code: 'INVALID_SQL', message: 'sensitive-local-sql', hint: 'sensitive-local-hint'}),
        new PersonaV2Error('AUTHORIZATION_DENIED', 'sensitive-domain-message'),
        new Error('sensitive-unexpected'),
      ];
      const replies = errors.map(error => reportPersonaV2ToolError(error, logger));
      logger.warn('redaction regression', {code: 'sensitive-oauth-code', password: 'sensitive-password',
        accessToken: 'sensitive-access', refreshToken: 'sensitive-refresh', authorization: 'sensitive-bearer',
        req: {body: {sql: 'sensitive-body'}, headers: {authorization: 'sensitive-header', cookie: 'sensitive-cookie'}}});
      console.log(JSON.stringify({replyIds: replies.map(({supportId, code}) => ({supportId, code}))}));
    `,
      ],
      { encoding: "utf8" },
    );
    const lines = output
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const events = lines.filter((line) => line.msg === "persona-v2 tool failed");
    const replies = lines.find((line) => line.replyIds).replyIds;
    expect(events).toHaveLength(4);
    expect(events.map((event) => event.errorCode)).toEqual([
      "PLUG_SERVER_ERROR",
      "INVALID_SQL",
      "AUTHORIZATION_DENIED",
      "CAPABILITY_UNAVAILABLE",
    ]);
    for (const [index, event] of events.entries()) {
      expect(event.supportId).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.supportId).toBe(replies[index].supportId);
      expect(event.errorCode).toBe(replies[index].code);
      expect(event).not.toHaveProperty("code");
      expect(event).not.toHaveProperty("message");
      expect(event).not.toHaveProperty("hint");
      expect(event).not.toHaveProperty("stack");
    }
    expect(new Set(events.map((event) => event.supportId)).size).toBe(4);
    expect(events[0].details).toEqual({ rpcCode: -32602, reason: "invalid_params" });
    expect(events[1]).toMatchObject({ source: "sql", stage: "validar_escopo" });
    const secretEvent = lines.find((line) => line.msg === "redaction regression");
    expect(secretEvent).toMatchObject({
      code: "[redacted]",
      password: "[redacted]",
      accessToken: "[redacted]",
      refreshToken: "[redacted]",
      authorization: "[redacted]",
      req: { body: "[redacted]", headers: { authorization: "[redacted]", cookie: "[redacted]" } },
    });
    expect(output).not.toContain("sensitive-");
  });
});
