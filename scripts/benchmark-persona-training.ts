import { performance } from "node:perf_hooks";
import { trainingTopic, TRAINING_TOPICS } from "../src/application/persona-v2/training-topics.js";
import { PERSONA_V2_TRAINING_BASE } from "../src/application/persona-v2/training-base.js";

// Local parsing only: no network/model latency or semantic-quality claim.
const iterations = 1000;
function measure(json: string): number {
  for (let i = 0; i < 100; i++) JSON.parse(json);
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) JSON.parse(json);
    return (performance.now() - start) / iterations;
  });
  return samples.sort((a, b) => a - b)[3]!;
}
const topics = TRAINING_TOPICS.map((topic) => {
  const guide = trainingTopic(topic);
  const compact = JSON.stringify(guide);
  const expanded = JSON.stringify({
    ...guide,
    trainingIntake: PERSONA_V2_TRAINING_BASE.trainingIntake,
  });
  return {
    topic,
    expandedBytes: Buffer.byteLength(expanded),
    compactBytes: Buffer.byteLength(compact),
    expandedParseMs: measure(expanded),
    compactParseMs: measure(compact),
  };
});
process.stdout.write(JSON.stringify({ scope: "local-json-parse", iterations, topics }) + "\n");
