export type StatusTone = "ok" | "warn" | "danger" | "neutral";

export const toneForStatus = (status: string): StatusTone => {
  const value = status.toLowerCase();
  if (value === "validada") {
    return "neutral";
  }
  if (["approved", "publicada", "active", "ativo", "ok"].includes(value)) {
    return "ok";
  }
  if (
    value === "unknown" ||
    value.includes("rascunho") ||
    value === "pendente" ||
    value === "aberto" ||
    value === "aberta"
  ) {
    return "warn";
  }
  if (["revoked", "rejected", "erro", "removida", "inativa"].includes(value)) {
    return "danger";
  }
  return "neutral";
};

const PASSO_LABEL: Record<string, string> = {
  treinar_sql: "Treinar SQL",
  descrever_params: "Descrever parâmetros",
  resolver_conflito: "Resolver conflito",
  listar_conflitos: "Ver conflitos",
  validar_skill: "Validar skill",
  publicar_skill: "Publicar",
  confirmar_coluna: "Confirmar coluna",
  confirmar_relacionamento: "Confirmar JOIN",
  remover_relacionamento: "Remover JOIN",
  mapear_tabela: "Mapear tabela",
  atualizar_skill: "Atualizar a skill",
  criar_skill: "Criar skill",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "aprovado",
  rascunho_revalidacao: "revalidação",
};

export const statusLabel = (status: string): string => STATUS_LABEL[status] ?? status;

export const passoLabel = (passo: string | null | undefined): string => {
  if (!passo) {
    return "—";
  }
  return PASSO_LABEL[passo] ?? passo;
};
