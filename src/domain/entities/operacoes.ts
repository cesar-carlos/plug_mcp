export type CategoriaAlertaOperacional = "slo" | "revisao";
export type SeveridadeAlertaOperacional = "atencao" | "critica";
export type StatusAlertaOperacional = "aberto" | "reconhecido" | "resolvido";
export type TipoEventoWebhook = "aberto" | "atualizado" | "resolvido";

/** Metadados permitidos: IDs, datas, contagens e taxas agregadas. */
export type MetadadosAlertaOperacional = Readonly<Record<string, string | number | boolean | null>>;

export interface AlertaOperacional {
  readonly id: string;
  readonly acessoId: string;
  readonly categoria: CategoriaAlertaOperacional;
  readonly severidade: SeveridadeAlertaOperacional;
  readonly fingerprint: string;
  readonly status: StatusAlertaOperacional;
  readonly metadados: MetadadosAlertaOperacional;
  readonly ocorrencias: number;
  readonly versao: number;
  readonly reconhecidoEm: Date | null;
  readonly resolvidoEm: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WebhookOperacional {
  readonly id: string;
  readonly acessoId: string;
  readonly urlEnc: string;
  readonly urlHash: string;
  readonly segredoEnc: string;
  readonly ativo: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EventoWebhookOperacional {
  readonly id: string;
  readonly acessoId: string;
  readonly webhookId: string;
  readonly alertaId: string;
  readonly alertaVersao: number;
  readonly tipoEvento: TipoEventoWebhook;
  readonly tentativas: number;
  readonly proximaTentativaEm: Date;
  readonly leaseAte: Date | null;
  readonly leasePor: string | null;
  readonly entregueEm: Date | null;
  readonly falhaPermanenteEm: Date | null;
  readonly ultimoErroCodigo: string | null;
  readonly ultimoStatusHttp: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
