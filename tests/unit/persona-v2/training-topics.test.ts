import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";
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
