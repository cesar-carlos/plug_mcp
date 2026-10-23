import type { Source } from "../persona-v2/model.js";
import type { PublicationFixtureSeed } from "../persona-v2/publication-fixture.js";

/** Operator-only local fixture control; no business SQL, credentials or approval flags. */
export interface PublicationFixtureControlPort {
  prepare(source: Source, seeds: readonly PublicationFixtureSeed[]): Promise<void>;
  clear(source: Source): Promise<void>;
}
