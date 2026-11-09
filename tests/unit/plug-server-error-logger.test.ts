import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("registra falhas do hub sem copiar SQL, parâmetros ou mensagens remotas", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
      import { createPino, PinoLoggerAdapter } from './src/infrastructure/logging/pino-logger.adapter.ts';
      import { mapPlugServerFailure } from './src/infrastructure/plug-server/map-plug-error.ts';
      const logger = new PinoLoggerAdapter(createPino('warn', false));
      for (const code of [-32102, -32013, -32602, -39999]) {
        mapPlugServerFailure({status: 200, body: {error: {
          code, message: 'private-message SELECT private-column FROM private-table',
          data: {reason: 'private-reason', technical_message: 'private-parameter',
            user_message: 'private-user', category: 'private-category', sqlstate: 'private-state'}
        }}}, logger);
      }
      mapPlugServerFailure({status: 503, body: {message: 'private-body'}}, logger);
    `,
    ],
    { encoding: "utf8" },
  );
  expect(output).not.toContain("private-");
  const events = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  expect(events).toHaveLength(5);
  expect(events.map((event) => event.rpcCode)).toEqual([-32102, -32013, -32602, -39999, undefined]);
  expect(events.map((event) => event.status)).toEqual([200, 200, 200, 200, 503]);
  for (const event of events) {
    expect(event.msg).toBe("plug-server failure detail");
    expect(Object.keys(event).sort()).toEqual(
      [
        "level",
        "time",
        "pid",
        "hostname",
        "msg",
        "status",
        ...(event.rpcCode === undefined ? [] : ["rpcCode"]),
      ].sort(),
    );
  }
});
