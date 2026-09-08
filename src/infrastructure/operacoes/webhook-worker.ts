import { createHmac, randomUUID } from "node:crypto";
import https from "node:https";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { OperacoesRepositoryPort } from "../../domain/ports/operacoes-repository.port.js";
import type { EventoWebhookOperacional } from "../../domain/entities/operacoes.js";
import type { MonitorOperacoes } from "../../application/use-cases/operacoes.js";
import type { WebhookDestinationPort } from "../../domain/ports/webhook-destination.port.js";

export interface WebhookPostInput {
  url: URL;
  address: string;
  family: 4 | 6;
  payload: string;
  eventId: string;
  secret: string;
  timeoutMs: number;
}

export const assinaturaWebhook = (timestamp: string, payload: string, secret: string): string =>
  `sha256=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;

export const postAssinado = async (input: WebhookPostInput): Promise<number> =>
  new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    const signature = assinaturaWebhook(timestamp, input.payload, input.secret);
    const request = https.request(
      {
        protocol: "https:",
        hostname: input.url.hostname,
        port: input.url.port || 443,
        path: input.url.pathname,
        method: "POST",
        servername: input.url.hostname,
        rejectUnauthorized: true,
        lookup: (_host, _opts, done) => done(null, input.address, input.family),
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(input.payload),
          "x-plug-event-id": input.eventId,
          "x-plug-timestamp": timestamp,
          "x-plug-signature-256": signature,
        },
        timeout: input.timeoutMs,
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.once("timeout", () => request.destroy(new Error("webhook_timeout")));
    request.once("error", reject);
    request.end(input.payload);
  });

const codigoFalhaSeguro = (error: unknown): string => {
  if (!(error instanceof Error)) return "webhook_delivery_failed";
  if (error.message === "webhook_timeout") return "webhook_timeout";
  if (error.message === "webhook_http") return "webhook_http";
  if (error.message.startsWith("webhook_")) return error.message.slice(0, 80);
  return "webhook_delivery_failed";
};

export class OperacoesWorker {
  readonly workerId = `mcp-operations-${randomUUID()}`;
  constructor(
    private readonly monitor: MonitorOperacoes,
    private readonly operacoes: OperacoesRepositoryPort,
    private readonly crypto: CryptoPort,
    private readonly logger: LoggerPort,
    private readonly destinos: WebhookDestinationPort,
    private readonly options: {
      timeoutMs: number;
      leaseMs?: number;
      maxAttempts?: number;
      post?: (input: WebhookPostInput) => Promise<number>;
    },
  ) {}

  private async entregar(evento: EventoWebhookOperacional, agora: Date): Promise<void> {
    const webhook = await this.operacoes.obterWebhook(evento.acessoId);
    const alerta = await this.operacoes.obterAlerta(evento.acessoId, evento.alertaId);
    if (!webhook?.ativo || !alerta) {
      await this.operacoes.marcarEntregue(evento.id, this.workerId, agora);
      return;
    }
    try {
      const url = new URL(this.crypto.decrypt(webhook.urlEnc));
      const destino = await this.destinos.resolve(url);
      const payload = JSON.stringify({
        id: evento.id,
        tipo: "operational_alert",
        occurredAt: agora.toISOString(),
        acessoId: evento.acessoId,
        alert: {
          id: alerta.id,
          categoria: alerta.categoria,
          severidade: alerta.severidade,
          status: alerta.status,
          ocorrencias: alerta.ocorrencias,
          metadados: alerta.metadados,
        },
      });
      const status = await (this.options.post ?? postAssinado)({
        url,
        ...destino,
        payload,
        eventId: evento.id,
        secret: this.crypto.decrypt(webhook.segredoEnc),
        timeoutMs: this.options.timeoutMs,
      });
      if (status >= 200 && status < 300) {
        await this.operacoes.marcarEntregue(evento.id, this.workerId, agora);
        return;
      }
      throw Object.assign(new Error("webhook_http"), { status });
    } catch (error) {
      const attempts = evento.tentativas + 1;
      const permanent = attempts >= (this.options.maxAttempts ?? 10);
      const status =
        typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : null;
      const waitMs = Math.min(
        86_400_000,
        1_000 * 2 ** Math.min(attempts, 10) + Math.floor(Math.random() * 1_000),
      );
      await this.operacoes.reagendarFalha({
        id: evento.id,
        workerId: this.workerId,
        agora,
        proximaTentativaEm: new Date(agora.getTime() + waitMs),
        tentativas: attempts,
        erroCodigo: codigoFalhaSeguro(error),
        statusHttp: status,
        permanente: permanent,
      });
      this.logger.warn("operational webhook delivery failed", {
        eventId: evento.id,
        acessoId: evento.acessoId,
        attempts,
        permanent,
        status,
      });
    }
  }

  async executarUmaVez(agora = new Date()): Promise<void> {
    await this.monitor.executar(agora);
    const eventos = await this.operacoes.reclamarEventos(
      this.workerId,
      agora,
      this.options.leaseMs ?? 305_000,
      20,
    );
    for (const evento of eventos) await this.entregar(evento, agora);
  }
}
