export interface ReviewPlanTarget {
  kind: "privado" | "padrao" | "perfil";
  draftId: string;
  personaId: string | null;
  catalogId: string | null;
  revision: number;
  hash: string;
}
export interface ReviewPublicationPlan extends ReviewPlanTarget {
  version: number;
  dueAt: string;
  ownerId: string;
}
