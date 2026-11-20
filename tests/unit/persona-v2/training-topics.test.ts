import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";
import { personaDialectGuide } from "../../../src/application/persona-v2/dialect-guide.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../../src/application/persona-v2/runtime-instructions.js";
import {
  TRAINING_TOPICS,
  trainingTopic,
  trainingManifest,
} from "../../../src/application/persona-v2/training-topics.js";
import { verifyPersonaTraining } from "../../../scripts/persona-training-check.js";
import {
  assertTrainingTopicBudgets,
  TRAINING_TOPIC_BYTE_LIMITS,
} from "../../../scripts/persona-training-budgets.js";

describe("public persona training topics", () => {
  it.each([undefined, "sql", "plug-server"] as const)(
    "exemplos de páginas do guia %s preservam tamanho e não repetem registros",
    (topic) => {
      const { pagination } = trainingTopic(topic)
        .queryContract as typeof PERSONA_V2_TRAINING_BASE.queryContract;
      const first = pagination.firstPage.options;
      const next = pagination.nextPageExample.options;
      expect(next.page).toBe(first.page + 1);
      expect(next.pageSize).toBe(first.pageSize);
      expect((next.page - 1) * next.pageSize).toBe(first.page * first.pageSize);
    },
  );
  it.each([undefined, "sql", "plug-server"] as const)(
    "guia %s evita contagem preventiva e salto após voltar uma página",
    (topic) => {
      const guide = trainingTopic(topic)
        .queryContract as typeof PERSONA_V2_TRAINING_BASE.queryContract;
      const text = guide.pagination.instructions;
      expect(text).toContain("Liste primeiro; contagem não é pré-requisito");
      expect(text).toContain("Atual = última página exibida, inclusive ao voltar");
      expect(text).toContain("próxima=atual+1, anterior=atual-1");
      expect(text).toContain("1→2→1→2, nunca maior visitada+1");
      expect(text).toContain("hasNextPage true");
      expect(text).toContain("hasPreviousPage true");
      expect(text).toContain("mudança de filtro reinicia página 1");
    },
  );
  it("orienta sondagem de 30 linhas sem inventar totais ou continuidade", () => {
    expect(PERSONA_V2_TRAINING_BASE.queryContract.pagination.firstPage.options).toEqual({
      page: 1,
      pageSize: 30,
    });
    for (const guidance of [PERSONA_V2_TRAINING_BASE.queryContract.pagination.instructions]) {
      for (const phrase of [
        "exatamente 30",
        "teto efetivo menor",
        "TOP 31",
        "hasPreviousPage",
        "mudança de filtro",
        "bytes",
        "mesmo grão",
        "ceil(total / pagination.pageSize)",
        "0 páginas",
        "sem prometer botões",
        "tempo observado",
        "ABC",
      ])
        expect(guidance).toContain(phrase);
    }
  });
  it("prioriza contexto atual e confirmação nesta conversa antes de escolher recorte", () => {
    const first = PERSONA_V2_INSTRUCTIONS.trim().split("\n")[0]!;
    expect(first).toContain("obter_contexto_persona");
    expect(first).toContain("antes de anunciar recorte");
    expect(first).toContain("outra conversa");
    expect(first).toContain("não execute consultas dependentes");
    expect(PERSONA_V2_TRAINING_BASE.workflow[0]).toContain("confirmação nesta conversa");
  });
  it("explicita limites de subtotais MSSQL sem contornar completude ou autorização", () => {
    for (const guide of [
      JSON.stringify(trainingTopic("sql")),
      personaDialectGuide("mssql").limite,
    ]) {
      expect(guide).toContain("GROUPING SETS");
      expect(guide).toContain("GROUPING()");
      expect(guide).toContain("GROUP BY simples");
    }
    const dialect = personaDialectGuide("mssql").limite;
    expect(dialect).toContain("mesmo recorte");
    expect(dialect).toContain("snapshot simultâneo");
    expect(dialect).toContain("página parcial");
    expect(personaDialectGuide("postgres").limite).not.toContain("GROUPING SETS");
  });
  it("orienta COUNT_BIG sem dispensar origem e limites do parser", () => {
    expect(JSON.stringify(trainingTopic("sql"))).toContain("COUNT_BIG exige origem");
    const sql = personaDialectGuide("mssql").limite;
    expect(sql).toContain("COUNT_BIG(alias.chave)");
    expect(sql).toContain("DISTINCT/ALL");
    expect(sql).toContain("ignora NULL");
    expect(sql).toContain("AGREGACAO_INSEGURA");
  });
  it.each(TRAINING_TOPICS)("enforces the exact byte ceiling for %s", (topic) => {
    const manifest = trainingManifest();
    const entry = manifest.topics.find((item) => item.topic === topic)!;
    entry.bytes = TRAINING_TOPIC_BYTE_LIMITS[topic];
    expect(() => assertTrainingTopicBudgets(manifest)).not.toThrow();
    entry.bytes++;
    expect(() => assertTrainingTopicBudgets(manifest)).toThrow(topic);
  });
  it("reduces repeated intake without removing error handling or the complete procedure", () => {
    for (const topic of TRAINING_TOPICS) {
      const guide = trainingTopic(topic);
      expect(guide.errorDiagnostics).toBe(PERSONA_V2_TRAINING_BASE.errorDiagnostics);
      if (topic === "knowledge") {
        expect(guide.trainingIntake).toBe(PERSONA_V2_TRAINING_BASE.trainingIntake);
      } else {
        const expanded = { ...guide, trainingIntake: PERSONA_V2_TRAINING_BASE.trainingIntake };
        expect(
          Buffer.byteLength(JSON.stringify(expanded)) - Buffer.byteLength(JSON.stringify(guide)),
        ).toBeGreaterThan(2000);
        expect(guide.trainingIntake).toContain('topic:"knowledge"');
      }
    }
  });
  it("keeps nested complete-base content immutable and its hash valid", () => {
    expect(() => {
      PERSONA_V2_TRAINING_BASE.queryContract.input = "changed";
    }).toThrow(TypeError);
    expect(() => {
      PERSONA_V2_TRAINING_BASE.implemented.push("invented capability");
    }).toThrow(TypeError);
    expect(verifyPersonaTraining()).toEqual(trainingManifest());
  });

  it("isolates manifest entries and identifies the exact serialized guide", () => {
    const original = trainingManifest();
    const changed = trainingManifest();
    changed.topics[0]!.contentHash = "changed";
    changed.topics.pop();
    expect(trainingManifest()).toEqual(original);
    for (const entry of original.topics) {
      const guide = trainingTopic(entry.topic);
      expect(entry.contentHash).toBe(guide.contentHash);
      expect(entry.bytes).toBe(Buffer.byteLength(JSON.stringify(guide), "utf8"));
    }
  });
  it.each(TRAINING_TOPICS)("binds the delivered %s guide to its exact content", (topic) => {
    const { contentHash, ...content } = trainingTopic(topic);
    expect(contentHash).toBe(createHash("sha256").update(canonicalJson(content)).digest("hex"));
    expect(content.baseHash).toBe(PERSONA_V2_TRAINING_BASE.hash);
    expect(trainingTopic(topic)).toEqual({ ...content, contentHash });
  });

  it("isolates nested objects from subsequent responses and the complete base", () => {
    const original = trainingTopic("sql");
    const changed = trainingTopic("sql") as { queryContract: { input: string } };
    changed.queryContract.input = "mutated response";
    expect(trainingTopic("sql")).toEqual(original);
    expect(trainingTopic("plug-server").queryContract).toEqual(original.queryContract);
    expect(PERSONA_V2_TRAINING_BASE.queryContract.input).not.toBe("mutated response");
  });

  it("teaches the v2 transport without importing legacy consumer authority", () => {
    const guide = trainingTopic("plug-server");
    expect(guide.hubCommands).toEqual(PERSONA_V2_TRAINING_BASE.hubCommands);
    expect(guide.hubContract).toEqual(PERSONA_V2_TRAINING_BASE.hubContract);
    const content = JSON.stringify(guide);
    expect(content).toContain("credencial cifrada de cada fonte");
    expect(content).not.toContain("CLIENT_EMAIL/CLIENT_PASSWORD");
    expect(content).toContain("options.pageSize");
    expect(content).toContain("HTTP 200 não prova sucesso");
    expect(content).toContain("sem repetir a requisição");
    expect(content).toContain("Timeout não garante cancelamento");
    expect(content).not.toContain("verificar_acesso");
    expect(content).not.toContain("guia://plug-server");
  });
});
