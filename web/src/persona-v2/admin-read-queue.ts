const contextChanged = () => new Error("O contexto mudou. A resposta anterior foi descartada.");
const busy = () =>
  new Error(
    "O console está ocupado. Aguarde as leituras atuais antes de solicitar novamente; não há reenvio automático.",
  );

/** Shared per console window, never an authorization/result cache. */
export class AdminReadQueue {
  private active = 0;
  private waiting: { start: () => void }[] = [];

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(contextChanged());
    if (this.active < 2) {
      this.active++;
      return Promise.resolve(this.release());
    }
    if (this.waiting.length >= 32) return Promise.reject(busy());
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const remove = (error: Error) => {
        this.waiting = this.waiting.filter((entry) => entry !== item);
        cleanup();
        reject(error);
      };
      const abort = () => remove(contextChanged());
      const item = {
        start: () => {
          cleanup();
          this.active++;
          resolve(this.release());
        },
      };
      const timer = setTimeout(() => remove(busy()), 10000);
      signal.addEventListener("abort", abort, { once: true });
      this.waiting.push(item);
    });
  }

  private release(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting.shift()?.start();
    };
  }
}

export const adminReads = new AdminReadQueue();
