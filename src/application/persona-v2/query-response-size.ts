/** The singleflight variant is the largest reusable envelope; one serialization checks both. */
export const queryResponseBytes = (response: object, reusable: boolean): number =>
  Buffer.byteLength(
    JSON.stringify(reusable ? { ...response, reuse: { kind: "singleflight" } } : response),
    "utf8",
  );
