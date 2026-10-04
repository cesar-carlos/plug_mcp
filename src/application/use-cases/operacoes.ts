import { createHash } from "node:crypto";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type { AnotacaoGrafoRepositoryPort } from "../../domain/ports/skill-repository.port.js";
import type { AuditLogPort } from "../../domain/ports/audit-log.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { OperacoesRepositoryPort } from "../../domain/ports/operacoes-repository.port.js";
import type { WebhookDestinationPort } from "../../domain/ports/webhook-destination.port.js";
import type {
  AlertaOperacional,
  MetadadosAlertaOperacional,
} from "../../domain/entities/operacoes.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import { requireAcesso, requireUsuario } from "./shared/guards.js";

const max = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const diaNoFuso = (date: Date, timezone: string | null): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

const somaDias = (date: string, days: number): string => {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/** Compartilhado conceitualmente com listar_anotacoes: agenda não muda vigência. */
export const proximaRevisao = (
  input: {
    revisarEm?: string | null;
    periodoRevisaoDias?: number | null;
    validadoEm?: Date | null;
    updatedAt: Date;
  },
  hoje: string,
  timezone: string | null,
): string | null => {
  const base =
    input.revisarEm ??
    (input.validadoEm
      ? diaNoFuso(input.validadoEm, timezone)
      : diaNoFuso(input.updatedAt, timezone));
  if (!input.periodoRevisaoDias) return input.revisarEm ?? null;
  const diff = Math.floor(
    (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000,
  );
  return somaDias(
    base,
    (diff <= 0 ? 0 : Math.ceil(diff / input.periodoRevisaoDias)) * input.periodoRevisaoDias,
  );
};

const alertaPublico = (alerta: AlertaOperacional) => ({
  id: alerta.id,
  categoria: alerta.categoria,
  severidade: alerta.severidade,
  status: alerta.status,
  metadados: alerta.metadados,
  ocorrencias: alerta.ocorrencias,
  createdAt: alerta.createdAt.toISOString(),
  updatedAt: alerta.updatedAt.toISOString(),
  reconhecidoEm: alerta.reconhecidoEm?.toISOString() ?? null,
  resolvidoEm: alerta.resolvidoEm?.toISOString() ?? null,
});
type AlertaPublico = ReturnType<typeof alertaPublico>;
interface EntregaPublica {
  id: string;
  alertaId: string;
  tentativas: number;
  pendente: boolean;
  deadLetter: boolean;
  ultimoErroCodigo: string | null;
  ultimoStatusHttp: number | null;
  updatedAt: string;
}

export class ListarAlertasOperacionais {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly operacoes: OperacoesRepositoryPort,
  ) {}
  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; limite?: number; status?: AlertaOperacional["status"] },
  ): Promise<{ success: true; alertas: AlertaPublico[]; entregas: EntregaPublica[] }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const alertas = await this.operacoes.listarAlertas(
      acesso.id,
      max(input.limite ?? 50, 1, 200),
      input.status,
    );
    const eventos = await this.operacoes.listarEventos(acesso.id, 50, true);
    return {
      success: true as const,
      alertas: alertas.map(alertaPublico),
      entregas: eventos.map((evento) => ({
        id: evento.id,
        alertaId: evento.alertaId,
        tentativas: evento.tentativas,
        pendente: evento.entregueEm === null,
        deadLetter: evento.falhaPermanenteEm !== null,
        ultimoErroCodigo: evento.ultimoErroCodigo,
        ultimoStatusHttp: evento.ultimoStatusHttp,
        updatedAt: evento.updatedAt.toISOString(),
      })),
    };
  }
}

export class ReconhecerAlertaOperacional {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly operacoes: OperacoesRepositoryPort,
  ) {}
  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; alertaId?: string },
  ): Promise<{ success: true; alerta: AlertaPublico }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    const alerta = input.alertaId
      ? await this.operacoes.reconhecerAlerta(acesso.id, input.alertaId, new Date())
      : null;
    if (!alerta)
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Alerta aberto não encontrado.",
        hint: "Use listar_alertas_operacionais desta persona.",
      });
    return { success: true as const, alerta: alertaPublico(alerta) };
  }
}

export class ConfigurarWebhookOperacional {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly operacoes: OperacoesRepositoryPort,
    private readonly crypto: CryptoPort,
    private readonly destinos: WebhookDestinationPort,
  ) {}
  async execute(
    usuarioId: string | undefined,
    input: {
      acessoId?: string;
      url?: string;
      segredo?: string;
      ativo?: boolean;
      confirmadoPeloUsuario?: boolean;
    },
  ): Promise<{ success: true; webhook: { ativo: boolean; configurado: boolean } }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    if (input.confirmadoPeloUsuario !== true)
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Configurar webhook exige confirmação do usuário.",
        hint: "Revise o destino e chame novamente com confirmadoPeloUsuario: true.",
      });
    const atual = await this.operacoes.obterWebhook(acesso.id);
    const ativo = input.ativo ?? true;
    if (!ativo) {
      if (!atual) return { success: true as const, webhook: { ativo: false, configurado: false } };
      const salvo = await this.operacoes.salvarWebhook({ ...atual, ativo: false });
      return { success: true as const, webhook: { ativo: salvo.ativo, configurado: true } };
    }
    let url: URL | null;
    try {
      url = input.url?.trim() ? await this.destinos.validate(input.url.trim()) : null;
    } catch {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Webhook deve usar destino HTTPS público seguro.",
        hint: "Não use loopback, IP privado, credenciais, query ou fragmento.",
      });
    }
    const segredo = input.segredo?.trim();
    if (!url || !segredo || segredo.length < 16 || segredo.length > 256) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Webhook ativo exige url HTTPS e segredo entre 16 e 256 caracteres.",
        hint: "O segredo será cifrado e nunca retornado.",
      });
    }
    const salvo = await this.operacoes.salvarWebhook({
      acessoId: acesso.id,
      urlEnc: this.crypto.encrypt(url.toString()),
      urlHash: createHash("sha256").update(url.toString()).digest("hex"),
      segredoEnc: this.crypto.encrypt(segredo),
      ativo: true,
    });
    return { success: true as const, webhook: { ativo: salvo.ativo, configurado: true } };
  }
}

export class RearmarWebhookOperacional {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly operacoes: OperacoesRepositoryPort,
  ) {}
  async execute(
    usuarioId: string | undefined,
    input: { acessoId?: string; eventoId?: string; confirmadoPeloUsuario?: boolean },
  ): Promise<{ success: true; rearmado: true }> {
    const uid = requireUsuario(usuarioId);
    const acesso = await requireAcesso(this.acessos, input.acessoId, uid);
    if (input.confirmadoPeloUsuario !== true)
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Rearmar webhook exige confirmação do usuário.",
        hint: "Chame novamente com confirmadoPeloUsuario: true.",
      });
    const rearmado = input.eventoId
      ? await this.operacoes.rearmarEvento(acesso.id, input.eventoId, new Date())
      : false;
    if (!rearmado)
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Evento pendente não encontrado.",
        hint: "Use o identificador de uma entrega em dead-letter desta persona.",
      });
    return { success: true as const, rearmado: true };
  }
}

export interface OperacoesMonitorConfig {
  readonly janelaMs: number;
  readonly minObservacoes: number;
  readonly erroAtencao: number;
  readonly erroCritica: number;
  readonly p95AtencaoMs: number;
  readonly p95CriticaMs: number;
  readonly truncamentoAtencao: number;
}

export class MonitorOperacoes {
  constructor(
    private readonly acessos: AcessoRepositoryPort,
    private readonly auditoria: AuditLogPort,
    private readonly anotacoes: AnotacaoGrafoRepositoryPort,
    private readonly operacoes: OperacoesRepositoryPort,
    private readonly config: OperacoesMonitorConfig,
  ) {}

  private async emitir(
    acessoId: string,
    categoria: AlertaOperacional["categoria"],
    severidade: AlertaOperacional["severidade"],
    fingerprint: string,
    metadados: MetadadosAlertaOperacional,
    agora: Date,
  ) {
    const { alerta, mudou } = await this.operacoes.upsertAlerta({
      acessoId,
      categoria,
      severidade,
      fingerprint,
      metadados,
      agora,
    });
    if (mudou) {
      const hook = await this.operacoes.obterWebhook(acessoId);
      if (hook?.ativo)
        await this.operacoes.enfileirar({
          acessoId,
          webhookId: hook.id,
          alertaId: alerta.id,
          alertaVersao: alerta.versao,
          tipoEvento: alerta.ocorrencias === 1 ? "aberto" : "atualizado",
          agora,
        });
    }
    return alerta.fingerprint;
  }

  private async resolver(
    acessoId: string,
    categoria: AlertaOperacional["categoria"],
    fingerprints: readonly string[],
    agora: Date,
  ) {
    const resolvidos = await this.operacoes.resolverAusentes(
      acessoId,
      categoria,
      fingerprints,
      agora,
    );
    const hook = await this.operacoes.obterWebhook(acessoId);
    if (hook?.ativo)
      for (const item of resolvidos)
        await this.operacoes.enfileirar({
          acessoId,
          webhookId: hook.id,
          alertaId: item.id,
          alertaVersao: item.versao,
          tipoEvento: "resolvido",
          agora,
        });
  }

  async executar(agora = new Date()): Promise<void> {
    const acessos = await this.acessos.listAll();
    for (const acesso of acessos) {
      const ativosSlo: string[] = [];
      const consultas = (await this.auditoria.listByAcesso(acesso.id, 1000)).filter(
        (item) =>
          (item.tool === "consultar_dados" || item.tool === "validar_consulta") &&
          item.createdAt.getTime() >= agora.getTime() - this.config.janelaMs,
      );
      if (consultas.length >= this.config.minObservacoes) {
        const erro = consultas.filter((item) => !item.sucesso).length / consultas.length;
        const truncamento =
          consultas.filter((item) => item.metadata?.truncated).length / consultas.length;
        const duracoes = consultas.map((item) => item.duracaoMs ?? 0).sort((a, b) => a - b);
        const p95 =
          duracoes[Math.min(duracoes.length - 1, Math.ceil(duracoes.length * 0.95) - 1)] ?? 0;
        const critica = erro >= this.config.erroCritica || p95 >= this.config.p95CriticaMs;
        const atencao =
          critica ||
          erro >= this.config.erroAtencao ||
          p95 >= this.config.p95AtencaoMs ||
          truncamento >= this.config.truncamentoAtencao;
        if (atencao)
          ativosSlo.push(
            await this.emitir(
              acesso.id,
              "slo",
              critica ? "critica" : "atencao",
              "janela-consulta",
              {
                observacoes: consultas.length,
                taxaErro: Number(erro.toFixed(4)),
                taxaTruncamento: Number(truncamento.toFixed(4)),
                p95Ms: p95,
                janelaMinutos: Math.round(this.config.janelaMs / 60_000),
              },
              agora,
            ),
          );
        await this.resolver(acesso.id, "slo", ativosSlo, agora);
      }

      const hoje = diaNoFuso(agora, acesso.timezone);
      const ativosRevisao: string[] = [];
      const notas = await this.anotacoes.list(acesso.id);
      for (const nota of notas) {
        if (
          nota.status === "obsoleta" ||
          (nota.vigenteDe && nota.vigenteDe > hoje) ||
          (nota.vigenteAte && nota.vigenteAte < hoje)
        )
          continue;
        const proxima = proximaRevisao(nota, hoje, acesso.timezone);
        const pendente = (proxima ?? "") <= hoje || (nota.vigenteAte ?? "") <= hoje;
        if (pendente)
          ativosRevisao.push(
            await this.emitir(
              acesso.id,
              "revisao",
              "atencao",
              `anotacao:${nota.id}`,
              {
                anotacaoId: nota.id,
                proximaRevisao: proxima ?? null,
                vigenteAte: nota.vigenteAte ?? null,
              },
              agora,
            ),
          );
      }
      await this.resolver(acesso.id, "revisao", ativosRevisao, agora);
    }
  }
}
