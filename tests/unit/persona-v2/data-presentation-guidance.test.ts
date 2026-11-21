import { describe, expect, it } from "vitest";
import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";

describe("orientação de apresentação entregue ao consumidor", () => {
  it.each([undefined] as const)(
    "guia %s preserva escolha visual, recorte e autoridade",
    (topic) => {
      const guidance = trainingTopic(topic).dataPresentation as Record<string, string>;
      expect(guidance).toBeDefined();
      for (const phrase of [
        "página estática",
        "não autentica visitantes",
        "própria concessão",
        "login não concede",
        "localStorage",
        "/mcp/chatgpt é transporte MCP",
        "Sem integração comprovada",
        "cache privado",
        "Não anunciar integração pronta",
      ])
        expect(guidance.hostedPages).toContain(phrase);
      expect(guidance.fidelity).toContain("Reconcilie valores do gráfico com o retorno");
      expect(guidance.fidelity).toContain("alternativa tabular");
      expect(guidance.fidelity).toContain("não dependa só de cor");
      for (const phrase of [
        "sem exigir totais ou gráfico",
        "ranking com barras",
        "temporal com linhas",
        "distribuição com histograma",
        "relação com dispersão",
        "pizza ou barras 100%",
        "ABC usa barras e percentual acumulado",
        "conjunto completo autorizado",
      ])
        expect(guidance.intent).toContain(phrase);
      for (const phrase of [
        "completeness",
        "provenance.readAt",
        "Nulos não são zero",
        "precisão decimal",
        "Não misture moedas",
      ])
        expect(guidance.evidence).toContain(phrase);
      for (const phrase of [
        "agregação autorizada antes da paginação",
        "nunca totalize só a página",
        "Não carregue tudo",
        "sem exigir contagem antes da listagem",
      ])
        expect(guidance.volume).toContain(phrase);
      for (const phrase of [
        "não comprova suporte visual",
        "fallback para tabela",
        "não são capacidades garantidas",
        "Não exponha credenciais, SQL privado",
        "sem autorização explícita",
      ])
        expect(guidance.capabilities).toContain(phrase);
      for (const phrase of [
        "apenas no recorte carregado",
        "nova consulta autorizada",
        "reinicia página 1",
        "não implica tempo real",
        "somente se suportado e solicitado",
        "não faça retry automático",
        "leitura antiga identificada",
      ])
        expect(guidance.interaction).toContain(phrase);
    },
  );
  it.each(["sql", "knowledge"] as const)("guia %s encaminha à orientação completa", (topic) => {
    expect(trainingTopic(topic).dataPresentation).toContain(
      "dataPresentation em obter_treinamento_base sem topic",
    );
    expect(trainingTopic().dataPresentation).toBeDefined();
  });
});
