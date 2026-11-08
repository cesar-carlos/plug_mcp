import assert from "node:assert/strict";
import { assertTrainingTopicBudgets } from "./persona-training-budgets.js";
import { createHash } from "node:crypto";
import { canonicalJson } from "../src/domain/persona-v2/catalog.js";
import { PERSONA_V2_TRAINING_BASE } from "../src/application/persona-v2/training-base.js";
import { PERSONA_V2_INSTRUCTIONS } from "../src/application/persona-v2/runtime-instructions.js";
import {
  TRAINING_TOPICS,
  trainingManifest,
  trainingTopic,
  trainingTopicInputSchema,
  type TrainingManifest,
} from "../src/application/persona-v2/training-topics.js";

/** Offline content checks only; upstream pin and release gates remain separate. */
export function verifyPersonaTraining(): TrainingManifest {
  const digest = (value: unknown): string =>
    createHash("sha256").update(canonicalJson(value)).digest("hex");
  const { hash, ...base } = PERSONA_V2_TRAINING_BASE;
  assert.equal(hash, digest(base), "Persona training base hash differs from content");
  assert.deepEqual(trainingTopic(), PERSONA_V2_TRAINING_BASE);
  assert.ok(trainingTopicInputSchema.safeParse({}).success);
  assert.ok(!trainingTopicInputSchema.safeParse({ topic: "legacy" }).success);
  assert.ok(!trainingTopicInputSchema.safeParse({ modulo: "plug-server" }).success);
  assert.ok(
    Buffer.byteLength(PERSONA_V2_INSTRUCTIONS, "utf8") < 36000,
    "Runtime guide exceeds budget",
  );
  const manifest = trainingManifest();
  assertTrainingTopicBudgets(manifest);
  assert.deepEqual(
    manifest.topics.map(({ topic }) => topic),
    [...TRAINING_TOPICS],
  );
  assert.equal(manifest.baseHash, hash);
  for (const entry of manifest.topics) {
    assert.ok(trainingTopicInputSchema.safeParse({ topic: entry.topic }).success);
    const guide = trainingTopic(entry.topic);
    const { contentHash, ...content } = guide;
    assert.equal(contentHash, digest(content), `Invalid hash for topic ${entry.topic}`);
    assert.equal(content.baseHash, hash);
    assert.equal(entry.contentHash, contentHash);
    assert.equal(entry.bytes, Buffer.byteLength(JSON.stringify(guide), "utf8"));
  }
  return manifest;
}
