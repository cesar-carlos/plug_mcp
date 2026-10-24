import type { Server } from "node:http";

/** Drain HTTP before disposing the runtime. A timeout does not cancel remote effects. */
export function createPersonaServerShutdown(
  server: Pick<Server, "close">,
  closeRuntime: () => Promise<void>,
  timeoutMs = 10_000,
): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () => {
    closing ??= new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Persona server shutdown timed out.")),
        timeoutMs,
      );
      // Keep the deadline alive even if HTTP has drained and runtime disposal hangs.
      const complete = (error?: Error): void => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      try {
        server.close((error) => {
          if (error) {
            complete(error);
            return;
          }
          void Promise.resolve()
            .then(closeRuntime)
            .then(
              () => complete(),
              (cause: unknown) => {
                complete(
                  cause instanceof Error ? cause : new Error("Persona runtime shutdown failed."),
                );
              },
            );
        });
      } catch (error: unknown) {
        complete(error instanceof Error ? error : new Error("Persona HTTP shutdown failed."));
      }
    });
    return closing;
  };
}
