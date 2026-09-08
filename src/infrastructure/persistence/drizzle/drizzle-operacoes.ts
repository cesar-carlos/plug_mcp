import { and, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type {
  AlertaOperacional,
  EventoWebhookOperacional,
  WebhookOperacional,
} from "../../../domain/entities/operacoes.js";
import type { OperacoesRepositoryPort } from "../../../domain/ports/operacoes-repository.port.js";
import type { Db } from "./db.js";
import * as schema from "../schema.js";

const alerta = (row: typeof schema.alertaOperacional.$inferSelect): AlertaOperacional => ({
  id: row.id,
  acessoId: row.acessoId,
  categoria: row.categoria,
  severidade: row.severidade,
  fingerprint: row.fingerprint,
  status: row.status,
  metadados: row.metadados,
  ocorrencias: row.ocorrencias,
  versao: row.versao,
  reconhecidoEm: row.reconhecidoEm,
  resolvidoEm: row.resolvidoEm,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const webhook = (row: typeof schema.webhookOperacional.$inferSelect): WebhookOperacional => ({
  id: row.id,
  acessoId: row.acessoId,
  urlEnc: row.urlEnc,
  urlHash: row.urlHash,
  segredoEnc: row.segredoEnc,
  ativo: row.ativo,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const evento = (
  row: typeof schema.webhookOperacionalOutbox.$inferSelect,
): EventoWebhookOperacional => ({
  id: row.id,
  acessoId: row.acessoId,
  webhookId: row.webhookId,
  alertaId: row.alertaId,
  alertaVersao: row.alertaVersao,
  tipoEvento: row.tipoEvento,
  tentativas: row.tentativas,
  proximaTentativaEm: row.proximaTentativaEm,
  leaseAte: row.leaseAte,
  leasePor: row.leasePor,
  entregueEm: row.entregueEm,
  falhaPermanenteEm: row.falhaPermanenteEm,
  ultimoErroCodigo: row.ultimoErroCodigo,
  ultimoStatusHttp: row.ultimoStatusHttp,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleOperacoesRepository implements OperacoesRepositoryPort {
  constructor(private readonly db: Db) {}

  async upsertAlerta(
    input: Parameters<OperacoesRepositoryPort["upsertAlerta"]>[0],
  ): ReturnType<OperacoesRepositoryPort["upsertAlerta"]> {
    const existing = await this.db.query.alertaOperacional.findFirst({
      where: and(
        eq(schema.alertaOperacional.acessoId, input.acessoId),
        eq(schema.alertaOperacional.categoria, input.categoria),
        eq(schema.alertaOperacional.fingerprint, input.fingerprint),
      ),
    });
    if (!existing) {
      const [row] = await this.db
        .insert(schema.alertaOperacional)
        .values({
          acessoId: input.acessoId,
          categoria: input.categoria,
          severidade: input.severidade,
          fingerprint: input.fingerprint,
          status: "aberto",
          metadados: input.metadados,
          createdAt: input.agora,
          updatedAt: input.agora,
        })
        .returning();
      return { alerta: alerta(row!), mudou: true };
    }
    const changed =
      existing.status === "resolvido" ||
      existing.severidade !== input.severidade ||
      JSON.stringify(existing.metadados) !== JSON.stringify(input.metadados);
    const [row] = await this.db
      .update(schema.alertaOperacional)
      .set({
        severidade: input.severidade,
        status: existing.status === "resolvido" ? "aberto" : existing.status,
        metadados: input.metadados,
        ocorrencias: existing.ocorrencias + 1,
        versao: changed ? existing.versao + 1 : existing.versao,
        resolvidoEm: existing.status === "resolvido" ? null : existing.resolvidoEm,
        updatedAt: input.agora,
      })
      .where(eq(schema.alertaOperacional.id, existing.id))
      .returning();
    return { alerta: alerta(row!), mudou: changed };
  }

  async resolverAusentes(
    acessoId: string,
    categoria: AlertaOperacional["categoria"],
    ativos: readonly string[],
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["resolverAusentes"]> {
    const where = [
      eq(schema.alertaOperacional.acessoId, acessoId),
      eq(schema.alertaOperacional.categoria, categoria),
      or(
        eq(schema.alertaOperacional.status, "aberto"),
        eq(schema.alertaOperacional.status, "reconhecido"),
      ),
    ];
    if (ativos.length > 0)
      where.push(sql`${schema.alertaOperacional.fingerprint} <> ALL(${ativos})`);
    const rows = await this.db
      .update(schema.alertaOperacional)
      .set({
        status: "resolvido",
        resolvidoEm: agora,
        versao: sql`${schema.alertaOperacional.versao} + 1`,
        updatedAt: agora,
      })
      .where(and(...where))
      .returning();
    return rows.map(alerta);
  }

  async listarAlertas(
    acessoId: string,
    limite: number,
    status?: AlertaOperacional["status"],
  ): ReturnType<OperacoesRepositoryPort["listarAlertas"]> {
    const rows = await this.db
      .select()
      .from(schema.alertaOperacional)
      .where(
        status
          ? and(
              eq(schema.alertaOperacional.acessoId, acessoId),
              eq(schema.alertaOperacional.status, status),
            )
          : eq(schema.alertaOperacional.acessoId, acessoId),
      )
      .orderBy(desc(schema.alertaOperacional.updatedAt))
      .limit(limite);
    return rows.map(alerta);
  }

  async obterAlerta(
    acessoId: string,
    alertaId: string,
  ): ReturnType<OperacoesRepositoryPort["obterAlerta"]> {
    const row = await this.db.query.alertaOperacional.findFirst({
      where: and(
        eq(schema.alertaOperacional.id, alertaId),
        eq(schema.alertaOperacional.acessoId, acessoId),
      ),
    });
    return row ? alerta(row) : null;
  }

  async reconhecerAlerta(
    acessoId: string,
    alertaId: string,
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["reconhecerAlerta"]> {
    const [row] = await this.db
      .update(schema.alertaOperacional)
      .set({
        status: "reconhecido",
        reconhecidoEm: agora,
        updatedAt: agora,
        versao: sql`${schema.alertaOperacional.versao} + 1`,
      })
      .where(
        and(
          eq(schema.alertaOperacional.id, alertaId),
          eq(schema.alertaOperacional.acessoId, acessoId),
          eq(schema.alertaOperacional.status, "aberto"),
        ),
      )
      .returning();
    return row ? alerta(row) : null;
  }

  async obterWebhook(acessoId: string): ReturnType<OperacoesRepositoryPort["obterWebhook"]> {
    const row = await this.db.query.webhookOperacional.findFirst({
      where: eq(schema.webhookOperacional.acessoId, acessoId),
    });
    return row ? webhook(row) : null;
  }

  async salvarWebhook(
    input: Omit<WebhookOperacional, "id" | "createdAt" | "updatedAt">,
  ): ReturnType<OperacoesRepositoryPort["salvarWebhook"]> {
    const [row] = await this.db
      .insert(schema.webhookOperacional)
      .values(input)
      .onConflictDoUpdate({
        target: schema.webhookOperacional.acessoId,
        set: {
          urlEnc: input.urlEnc,
          urlHash: input.urlHash,
          segredoEnc: input.segredoEnc,
          ativo: input.ativo,
          updatedAt: new Date(),
        },
      })
      .returning();
    return webhook(row!);
  }

  async enfileirar(
    input: Parameters<OperacoesRepositoryPort["enfileirar"]>[0],
  ): ReturnType<OperacoesRepositoryPort["enfileirar"]> {
    await this.db
      .insert(schema.webhookOperacionalOutbox)
      .values({
        ...input,
        proximaTentativaEm: input.agora,
        createdAt: input.agora,
        updatedAt: input.agora,
      })
      .onConflictDoNothing();
  }

  async reclamarEventos(
    workerId: string,
    agora: Date,
    leaseMs: number,
    limite: number,
  ): ReturnType<OperacoesRepositoryPort["reclamarEventos"]> {
    const candidates = await this.db
      .select()
      .from(schema.webhookOperacionalOutbox)
      .where(
        and(
          isNull(schema.webhookOperacionalOutbox.entregueEm),
          isNull(schema.webhookOperacionalOutbox.falhaPermanenteEm),
          lte(schema.webhookOperacionalOutbox.proximaTentativaEm, agora),
          or(
            isNull(schema.webhookOperacionalOutbox.leaseAte),
            lte(schema.webhookOperacionalOutbox.leaseAte, agora),
          ),
        ),
      )
      .orderBy(schema.webhookOperacionalOutbox.proximaTentativaEm)
      .limit(limite);
    const leaseAte = new Date(agora.getTime() + leaseMs);
    const claimed: EventoWebhookOperacional[] = [];
    for (const candidate of candidates) {
      const [row] = await this.db
        .update(schema.webhookOperacionalOutbox)
        .set({ leasePor: workerId, leaseAte, updatedAt: agora })
        .where(
          and(
            eq(schema.webhookOperacionalOutbox.id, candidate.id),
            or(
              isNull(schema.webhookOperacionalOutbox.leaseAte),
              lte(schema.webhookOperacionalOutbox.leaseAte, agora),
            ),
            isNull(schema.webhookOperacionalOutbox.entregueEm),
            isNull(schema.webhookOperacionalOutbox.falhaPermanenteEm),
          ),
        )
        .returning();
      if (row) claimed.push(evento(row));
    }
    return claimed;
  }

  async listarEventos(
    acessoId: string,
    limite: number,
    somenteFalhas = false,
  ): ReturnType<OperacoesRepositoryPort["listarEventos"]> {
    const rows = await this.db
      .select()
      .from(schema.webhookOperacionalOutbox)
      .where(
        somenteFalhas
          ? and(
              eq(schema.webhookOperacionalOutbox.acessoId, acessoId),
              isNull(schema.webhookOperacionalOutbox.entregueEm),
            )
          : eq(schema.webhookOperacionalOutbox.acessoId, acessoId),
      )
      .orderBy(desc(schema.webhookOperacionalOutbox.updatedAt))
      .limit(limite);
    return rows.map(evento);
  }

  async marcarEntregue(
    id: string,
    workerId: string,
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["marcarEntregue"]> {
    await this.db
      .update(schema.webhookOperacionalOutbox)
      .set({ entregueEm: agora, leaseAte: null, leasePor: null, updatedAt: agora })
      .where(
        and(
          eq(schema.webhookOperacionalOutbox.id, id),
          eq(schema.webhookOperacionalOutbox.leasePor, workerId),
        ),
      );
  }

  async reagendarFalha(
    input: Parameters<OperacoesRepositoryPort["reagendarFalha"]>[0],
  ): ReturnType<OperacoesRepositoryPort["reagendarFalha"]> {
    await this.db
      .update(schema.webhookOperacionalOutbox)
      .set({
        tentativas: input.tentativas,
        proximaTentativaEm: input.proximaTentativaEm,
        ultimoErroCodigo: input.erroCodigo,
        ultimoStatusHttp: input.statusHttp,
        falhaPermanenteEm: input.permanente ? input.agora : null,
        leaseAte: null,
        leasePor: null,
        updatedAt: input.agora,
      })
      .where(
        and(
          eq(schema.webhookOperacionalOutbox.id, input.id),
          eq(schema.webhookOperacionalOutbox.leasePor, input.workerId),
        ),
      );
  }

  async rearmarEvento(
    acessoId: string,
    eventoId: string,
    agora: Date,
  ): ReturnType<OperacoesRepositoryPort["rearmarEvento"]> {
    const rows = await this.db
      .update(schema.webhookOperacionalOutbox)
      .set({
        tentativas: 0,
        proximaTentativaEm: agora,
        falhaPermanenteEm: null,
        ultimoErroCodigo: null,
        ultimoStatusHttp: null,
        leaseAte: null,
        leasePor: null,
        updatedAt: agora,
      })
      .where(
        and(
          eq(schema.webhookOperacionalOutbox.id, eventoId),
          eq(schema.webhookOperacionalOutbox.acessoId, acessoId),
          isNull(schema.webhookOperacionalOutbox.entregueEm),
          isNotNull(schema.webhookOperacionalOutbox.falhaPermanenteEm),
        ),
      )
      .returning();
    return rows.length > 0;
  }
}
