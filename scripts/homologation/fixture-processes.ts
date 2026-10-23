import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { z } from "zod";

interface FixtureChild {
  process: ChildProcess;
  exit: Promise<number | null>;
  completed: boolean;
  expected: boolean;
  failed: boolean;
}

/** Private logs and cooperative shutdown only; never kill a PID discovered by name. */
export class FixtureProcesses {
  private readonly children: FixtureChild[] = [];
  constructor(private readonly root: string) {}

  launch(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    label: string,
  ): FixtureChild {
    if (!/^[a-z-]+$/.test(label)) throw new Error("Identificação de processo de fixture inválida.");
    const log = createWriteStream(join(this.root, `${label}.log`), { flags: "wx", mode: 0o600 });
    const process = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    process.stdout?.pipe(log, { end: false });
    process.stderr?.pipe(log, { end: false });
    const child: FixtureChild = {
      process,
      completed: false,
      expected: false,
      failed: false,
      exit: Promise.resolve(null),
    };
    log.once("error", () => {
      child.failed = true;
    });
    child.exit = new Promise((resolve) => {
      process.once("error", () => {
        child.failed = true;
      });
      process.once("close", (code) => {
        const complete = () => {
          child.completed = true;
          resolve(code);
        };
        if (log.destroyed) complete();
        else log.end(complete);
      });
    });
    this.children.push(child);
    return child;
  }

  assertRunning(): void {
    if (this.children.some((child) => child.failed || (child.completed && !child.expected))) {
      throw new Error("Um serviço da fixture encerrou. Confira apenas seus logs privados.");
    }
  }

  async completed(child: FixtureChild, timeoutMs = 120_000): Promise<void> {
    const result = await Promise.race([
      child.exit,
      delay(timeoutMs, undefined, { ref: false }).then(() => "timeout"),
    ]);
    if (result !== 0 || child.failed)
      throw new Error("Preparação da fixture falhou ou expirou; serviços serão encerrados.");
    child.expected = true;
  }

  async waitJson<T>(file: string, schema: z.ZodType<T>, timeoutMs = 120_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.assertRunning();
      if (existsSync(join(this.root, file))) {
        let raw: unknown;
        try {
          raw = JSON.parse(readFileSync(join(this.root, file), "utf8"));
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          await delay(100);
          continue;
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) throw new Error("Confirmação de serviço da fixture inválida.");
        return parsed.data;
      }
      await delay(100);
    }
    throw new Error("Serviço da fixture não confirmou inicialização no prazo.");
  }

  async stop(): Promise<{ stopped: boolean; clean: boolean }> {
    const results = await Promise.all(
      this.children.map((child) =>
        Promise.race([
          child.exit.then((code) => ({ stopped: true, clean: code === 0 && !child.failed })),
          delay(60_000, undefined, { ref: false }).then(() => ({ stopped: false, clean: false })),
        ]),
      ),
    );
    return {
      stopped: results.every((result) => result.stopped),
      clean: results.every((result) => result.clean),
    };
  }
}
