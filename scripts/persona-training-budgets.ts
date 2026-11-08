import type { TrainingManifest } from "../src/application/persona-v2/training-topics.js";

export const TRAINING_TOPIC_BYTE_LIMITS = Object.freeze({
  sql: 33000,
  knowledge: 22000,
  operations: 12000,
  administration: 12500,
  "plug-server": 18000,
});
export function assertTrainingTopicBudgets(manifest: TrainingManifest): void {
  for (const entry of manifest.topics) {
    const limit = TRAINING_TOPIC_BYTE_LIMITS[entry.topic];
    if (
      !Number.isSafeInteger(limit) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > limit
    )
      throw new Error(`Training topic ${entry.topic} exceeds its UTF-8 byte budget (${limit})`);
  }
}
