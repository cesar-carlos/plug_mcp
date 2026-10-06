/** Identidade construída na borda; nunca recebida nos argumentos das tools. */
export type ConsumerAuth =
  | {
      readonly kind: "manual";
      readonly usuarioId: string;
      readonly acessoId: string;
      readonly sourceHash: string;
    }
  | {
      readonly kind: "oauth";
      readonly usuarioId: string;
      readonly acessoId: string;
      readonly sourceHash: string;
      readonly grantId: string;
      readonly tokenHash?: string;
      readonly expiresAt: number;
    };
