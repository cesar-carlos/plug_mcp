import type {
  AlertaOperacional,
  CategoriaAlertaOperacional,
  EventoWebhookOperacional,
  MetadadosAlertaOperacional,
  SeveridadeAlertaOperacional,
  TipoEventoWebhook,
  WebhookOperacional,
} from "../entities/operacoes.js";

export interface OperacoesRepositoryPort {
  upsertAlerta(input: {
    acessoId: string;
    categoria: CategoriaAlertaOperacional;
    severidade: SeveridadeAlertaOperacional;
    fingerprint: string;
    metadados: MetadadosAlertaOperacional;
    agora: Date;
  }): Promise<{ alerta: AlertaOperacional; mudou: boolean }>;
  resolverAusentes(
    acessoId: string,
    categoria: CategoriaAlertaOperacional,
    ativos: readonly string[],
    agora: Date,
  ): Promise<readonly AlertaOperacional[]>;
  listarAlertas(
    acessoId: string,
    limite: number,
    status?: AlertaOperacional["status"],
  ): Promise<readonly AlertaOperacional[]>;
  obterAlerta(acessoId: string, alertaId: string): Promise<AlertaOperacional | null>;
  reconhecerAlerta(
    acessoId: string,
    alertaId: string,
    agora: Date,
  ): Promise<AlertaOperacional | null>;
  obterWebhook(acessoId: string): Promise<WebhookOperacional | null>;
  salvarWebhook(
    input: Omit<WebhookOperacional, "id" | "createdAt" | "updatedAt">,
  ): Promise<WebhookOperacional>;
  enfileirar(input: {
    acessoId: string;
    webhookId: string;
    alertaId: string;
    alertaVersao: number;
    tipoEvento: TipoEventoWebhook;
    agora: Date;
  }): Promise<void>;
  reclamarEventos(
    workerId: string,
    agora: Date,
    leaseMs: number,
    limite: number,
  ): Promise<readonly EventoWebhookOperacional[]>;
  listarEventos(
    acessoId: string,
    limite: number,
    somenteFalhas?: boolean,
  ): Promise<readonly EventoWebhookOperacional[]>;
  marcarEntregue(id: string, workerId: string, agora: Date): Promise<void>;
  reagendarFalha(input: {
    id: string;
    workerId: string;
    agora: Date;
    proximaTentativaEm: Date;
    tentativas: number;
    erroCodigo: string;
    statusHttp: number | null;
    permanente: boolean;
  }): Promise<void>;
  rearmarEvento(acessoId: string, eventoId: string, agora: Date): Promise<boolean>;
}
