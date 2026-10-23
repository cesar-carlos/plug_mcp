import { appendFileSync } from "node:fs";
import { join } from "node:path";

/** Metadata only: no request, resource identifier, SQL or consumer material. */
export function recordJourneyTiming(root: string, engine: string, journey: "adoption" | "oauth") {
  const start = performance.now();
  let previous = start;
  return (
    stage:
      | "start"
      | "profile"
      | "library"
      | "curation"
      | "history"
      | "prepared"
      | "composed"
      | "verified"
      | "complete",
  ) => {
    const now = performance.now();
    appendFileSync(
      join(root, "journey-timings.jsonl"),
      `${JSON.stringify({
        engine,
        journey,
        stage,
        at: new Date().toISOString(),
        elapsedMs: Math.round(now - start),
        phaseMs: Math.round(now - previous),
      })}\n`,
    );
    previous = now;
  };
}
