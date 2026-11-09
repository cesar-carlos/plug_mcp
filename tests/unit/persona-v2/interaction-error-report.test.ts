import { INTERACTION_ERROR_GUIDANCE } from "../../../src/application/persona-v2/interaction-error-guidance.js";
import {
  TRAINING_TOPICS,
  trainingTopic,
} from "../../../src/application/persona-v2/training-topics.js";
import { describe, expect, it } from "vitest";
import {
  PLUG_SERVER_STAGES,
  PLUG_SERVER_PHASE_STAGES,
} from "../../../src/domain/errors/plug-server-stages.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../../src/application/persona-v2/runtime-instructions.js";
import { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";
import {
  interactionErrorReportSchema,
  trainingRequestSchema,
} from "../../../src/domain/persona-v2/interaction-error-report.js";

const supportId = "22222222-2222-4222-8222-222222222222";
const report = {
  question: "Qual o total de pedidos do período sintético?",
  category: "consulta",
  error: {
    code: "AUTHORIZATION_DENIED",
    message: "Concessão indisponível para esta consulta.",
    supportId,
    source: "mcp",
    tool: "consultar_dados",
  },
  execution: {
    summary: "A consulta foi recusada antes do envio.",
    steps: [{ tool: "consultar_dados", outcome: "erro", code: "AUTHORIZATION_DENIED" }],
  },
};

describe("relato de erro da interação", () => {
  it("aceita pergunta, categoria, erro e execução vazia", () => {
    expect(
      interactionErrorReportSchema.parse({
        ...report,
        category: "protocolo",
        execution: { summary: "Nenhuma tool chegou a executar.", steps: [] },
      }).execution.steps,
    ).toEqual([]);
  });

  it.each([
    "protocol",
    "authentication",
    "request",
    "validar_escopo",
    ...PLUG_SERVER_STAGES,
    ...PLUG_SERVER_PHASE_STAGES,
  ])("preserva etapa MCP %s", (stage) => {
    expect(
      interactionErrorReportSchema.parse({ ...report, error: { ...report.error, stage } }).error,
    ).toMatchObject({ supportId, stage });
  });

  it("exige detalhe só na categoria outro e recusa campo extra", () => {
    expect(interactionErrorReportSchema.safeParse({ ...report, category: "outro" }).success).toBe(
      false,
    );
    expect(
      interactionErrorReportSchema.safeParse({
        ...report,
        category: "outro",
        categoryDetail: "Falha fora das categorias conhecidas.",
      }).success,
    ).toBe(true);
    expect(
      interactionErrorReportSchema.safeParse({ ...report, categoryDetail: "não cabe" }).success,
    ).toBe(false);
    expect(interactionErrorReportSchema.safeParse({ ...report, sql: "select 1" }).success).toBe(
      false,
    );
    expect(
      interactionErrorReportSchema.safeParse({
        ...report,
        execution: { summary: "passo sem tool", steps: [{ outcome: "erro" }] },
      }).success,
    ).toBe(false);
  });

  it.each(TRAINING_TOPICS)(
    "entrega no tópico %s um pedido de curadoria válido sem identificador reutilizável",
    (topic) => {
      const guide = trainingTopic(topic);
      const example = trainingRequestSchema.parse(guide.trainingRequestExample);
      expect(example).toMatchObject({
        gap: "regra",
        intent: expect.any(String),
        missing: expect.any(String),
        acceptance: expect.any(String),
      });
      expect(example.requestId).toBeUndefined();
      expect(example.skillId).toBeUndefined();
      if (topic === "knowledge")
        expect(guide.trainingIntake).toBe(PERSONA_V2_TRAINING_BASE.trainingIntake);
      else {
        expect(guide.trainingIntake).toContain('topic:"knowledge"');
        expect(guide.trainingIntake).toContain("não envie SQL");
        expect(guide.trainingIntake).toContain("Não reenvie automaticamente");
      }
    },
  );
  it("orienta a IA a reportar o erro uma vez", () => {
    expect(PERSONA_V2_INSTRUCTIONS).toContain(INTERACTION_ERROR_GUIDANCE);
    expect(PERSONA_V2_TRAINING_BASE.errorDiagnostics).toContain(INTERACTION_ERROR_GUIDANCE);
    expect(PERSONA_V2_TRAINING_BASE.errorDiagnostics).toContain("reportar_erro_interacao");
    expect(Buffer.byteLength(PERSONA_V2_INSTRUCTIONS, "utf8")).toBeLessThan(36000);
  });
});
