export interface ConsumerEvaluationInput {
  readonly model: string;
  readonly question: string;
  readonly instructions: string;
  readonly tools: readonly {
    name: string;
    description: string;
    inputSchema: Readonly<Record<string, unknown>>;
  }[];
  readonly resources: readonly string[];
  readonly readResource: (uri: string) => Promise<unknown>;
  readonly context: {
    readonly empresa: string;
    readonly params: Readonly<Record<string, string | number>>;
  };
  readonly callTool: (
    name:
      | "obter_treinamento_base"
      | "buscar_contexto"
      | "obter_skill"
      | "validar_consulta"
      | "consultar_dados",
    args: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
}
export interface ConsumerEvaluationAnswer {
  readonly decision: "responder" | "ambigua" | "sem_cobertura" | "recusar";
  readonly answer: string;
  readonly usage?: Readonly<Record<string, number>>;
  /** Valores finais interpretados na resposta; não basta devolver SQL. */
  readonly rows?: readonly Readonly<Record<string, string | number | null>>[];
}
export interface ConsumerEvaluationAdapter {
  readonly kind: "model" | "harness";
  readonly model: string;
  evaluate(input: ConsumerEvaluationInput): Promise<ConsumerEvaluationAnswer>;
  /** Evaluator-only stage; never supplies the reference to the consuming model. */
  judgeAnswer?(input: {
    question: string;
    answer: string;
    actualRows: readonly Readonly<Record<string, unknown>>[];
    expectedRows: readonly Readonly<Record<string, unknown>>[];
  }): Promise<{ passed: boolean; model: string }>;
}
