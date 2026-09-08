import { randomUUID } from "node:crypto";
import type {
  AlertaOperacional,
  EventoWebhookOperacional,
  WebhookOperacional,
} from "../../../domain/entities/operacoes.js";
import type { OperacoesRepositoryPort } from "../../../domain/ports/operacoes-repository.port.js";

export class InMemoryOperacoesRepository implements OperacoesRepositoryPort {
  readonly alertas: AlertaOperacional[] = [];
  readonly webhooks: WebhookOperacional[] = [];
  readonly eventos: EventoWebhookOperacional[] = [];

  async upsertAlerta(
    input: Parameters<OperacoesRepositoryPort["upsertAlerta"]>[0],
  ): ReturnType<OperacoesRepositoryPort["upsertAlerta"]> {
    const index = this.alertas.findIndex(
      (row) =>
        row.acessoId === input.acessoId &&
        row.categoria === input.categoria &&
        row.fingerprint === input.fingerprint,
    );
    if (index < 0) {
      const row: AlertaOperacional = {
        id: randomUUID(),
        acessoId: input.acessoId,
        categoria: input.categoria,
        severidade: input.severidade,
        fingerprint: input.fingerprint,
        status: "aberto",
        metadados: input.metadados,
        ocorrencias: 1,
        versao: 1,
        reconhecidoEm: null,
        resolvidoEm: null,
        createdAt: input.agora,
        updatedAt: input.agora,
      };
      this.alertas.push(row);
      return { alerta: row, mudou: true };
    }
    const prior = this.alertas[index]!;
    const mudou =
      prior.status === "resolvido" ||
      prior.severidade !== input.severidade ||
      JSON.stringify(prior.metadados) !== JSON.stringify(input.metadados);
    const next: AlertaOperacional = {
      ...prior,
      severidade: input.severidade,
      status: prior.status === "resolvido" ? "aberto" : prior.status,
      metadados: input.metadados,
      ocorrencias: prior.ocorrencias + 1,
      versao: mudou ? prior.versao + 1 : prior.versao,
      resolvidoEm: prior.status === "resolvido" ? null : prior.resolvidoEm,
      updatedAt: input.agora,
    };
    this.alertas[index] = next;
    return { alerta: next, mudou };
  }

  async resolverAusentes(
    acessoId: string,
    categoria: AlertaOperacional["categoria"],
    ativos: readonly string[],
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["resolverAusentes"]> {
    const resolved: AlertaOperacional[] = [];
    this.alertas.forEach((row, index) => {
      if (
        row.acessoId !== acessoId ||
        row.categoria !== categoria ||
        row.status === "resolvido" ||
        ativos.includes(row.fingerprint)
      )
        return;
      const next: AlertaOperacional = {
        ...row,
        status: "resolvido",
        resolvidoEm: agora,
        versao: row.versao + 1,
        updatedAt: agora,
      };
      this.alertas[index] = next;
      resolved.push(next);
    });
    return resolved;
  }

  async listarAlertas(
    acessoId: string,
    limite: number,
    status?: AlertaOperacional["status"],
  ): ReturnType<OperacoesRepositoryPort["listarAlertas"]> {
    return this.alertas
      .filter((row) => row.acessoId === acessoId && (!status || row.status === status))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limite);
  }

  async obterAlerta(
    acessoId: string,
    alertaId: string,
  ): ReturnType<OperacoesRepositoryPort["obterAlerta"]> {
    return this.alertas.find((row) => row.acessoId === acessoId && row.id === alertaId) ?? null;
  }

  async reconhecerAlerta(
    acessoId: string,
    alertaId: string,
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["reconhecerAlerta"]> {
    const index = this.alertas.findIndex(
      (row) => row.acessoId === acessoId && row.id === alertaId && row.status === "aberto",
    );
    if (index < 0) return null;
    const next: AlertaOperacional = {
      ...this.alertas[index]!,
      status: "reconhecido",
      reconhecidoEm: agora,
      versao: this.alertas[index]!.versao + 1,
      updatedAt: agora,
    };
    this.alertas[index] = next;
    return next;
  }

  async obterWebhook(acessoId: string): ReturnType<OperacoesRepositoryPort["obterWebhook"]> {
    return this.webhooks.find((row) => row.acessoId === acessoId) ?? null;
  }

  async salvarWebhook(
    input: Omit<WebhookOperacional, "id" | "createdAt" | "updatedAt">,
  ): ReturnType<OperacoesRepositoryPort["salvarWebhook"]> {
    const index = this.webhooks.findIndex((row) => row.acessoId === input.acessoId);
    const agora = new Date();
    const row: WebhookOperacional = {
      id: index < 0 ? randomUUID() : this.webhooks[index]!.id,
      ...input,
      createdAt: index < 0 ? agora : this.webhooks[index]!.createdAt,
      updatedAt: agora,
    };
    if (index < 0) this.webhooks.push(row);
    else this.webhooks[index] = row;
    return row;
  }

  async enfileirar(
    input: Parameters<OperacoesRepositoryPort["enfileirar"]>[0],
  ): ReturnType<OperacoesRepositoryPort["enfileirar"]> {
    if (
      this.eventos.some(
        (row) =>
          row.webhookId === input.webhookId &&
          row.alertaId === input.alertaId &&
          row.alertaVersao === input.alertaVersao,
      )
    )
      return;
    this.eventos.push({
      id: randomUUID(),
      ...input,
      tentativas: 0,
      proximaTentativaEm: input.agora,
      leaseAte: null,
      leasePor: null,
      entregueEm: null,
      falhaPermanenteEm: null,
      ultimoErroCodigo: null,
      ultimoStatusHttp: null,
      createdAt: input.agora,
      updatedAt: input.agora,
    });
  }

  async reclamarEventos(
    workerId: string,
    agora: Date,
    leaseMs: number,
    limite: number,
  ): ReturnType<OperacoesRepositoryPort["reclamarEventos"]> {
    const leaseAte = new Date(agora.getTime() + leaseMs);
    const claimed: EventoWebhookOperacional[] = [];
    this.eventos.forEach((row, index) => {
      if (
        claimed.length >= limite ||
        row.entregueEm ||
        row.falhaPermanenteEm ||
        row.proximaTentativaEm > agora ||
        (row.leaseAte && row.leaseAte > agora)
      )
        return;
      const next = { ...row, leasePor: workerId, leaseAte, updatedAt: agora };
      this.eventos[index] = next;
      claimed.push(next);
    });
    return claimed;
  }

  async listarEventos(
    acessoId: string,
    limite: number,
    somenteFalhas = false,
  ): ReturnType<OperacoesRepositoryPort["listarEventos"]> {
    return this.eventos
      .filter((row) => row.acessoId === acessoId && (!somenteFalhas || !row.entregueEm))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limite);
  }

  async marcarEntregue(
    id: string,
    workerId: string,
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["marcarEntregue"]> {
    const index = this.eventos.findIndex((row) => row.id === id && row.leasePor === workerId);
    if (index >= 0)
      this.eventos[index] = {
        ...this.eventos[index]!,
        entregueEm: agora,
        leasePor: null,
        leaseAte: null,
        updatedAt: agora,
      };
  }

  async reagendarFalha(
    input: Parameters<OperacoesRepositoryPort["reagendarFalha"]>[0],
  ): ReturnType<OperacoesRepositoryPort["reagendarFalha"]> {
    const index = this.eventos.findIndex(
      (row) => row.id === input.id && row.leasePor === input.workerId,
    );
    if (index >= 0)
      this.eventos[index] = {
        ...this.eventos[index]!,
        tentativas: input.tentativas,
        proximaTentativaEm: input.proximaTentativaEm,
        ultimoErroCodigo: input.erroCodigo,
        ultimoStatusHttp: input.statusHttp,
        falhaPermanenteEm: input.permanente ? input.agora : null,
        leaseAte: null,
        leasePor: null,
        updatedAt: input.agora,
      };
  }

  async rearmarEvento(
    acessoId: string,
    eventoId: string,
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["rearmarEvento"]> {
    const index = this.eventos.findIndex(
      (row) =>
        row.id === eventoId &&
        row.acessoId === acessoId &&
        !row.entregueEm &&
        Boolean(row.falhaPermanenteEm),
    );
    if (index < 0) return false;
    this.eventos[index] = {
      ...this.eventos[index]!,
      tentativas: 0,
      proximaTentativaEm: agora,
      falhaPermanenteEm: null,
      ultimoErroCodigo: null,
      ultimoStatusHttp: null,
      leaseAte: null,
      leasePor: null,
      updatedAt: agora,
    };
    return true;
  }
}
