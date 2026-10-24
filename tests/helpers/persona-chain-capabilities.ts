/** Fixture diagnostics only: no SQL, credential, body or business data persisted. */
export async function readFixtureCapabilities(
  hubUrl: string,
  agentId: string,
  accessToken: string,
): Promise<{
  checkedAt: string;
  status: number | null;
  connected: boolean | null;
  sourceIdentity: number | null;
  sourceSchema: number | null;
  sourceConstraints: number | null;
  sqlOperations: number | null;
  transportError: boolean;
}> {
  const base = new URL(hubUrl);
  if (
    base.protocol !== "http:" ||
    base.hostname !== "127.0.0.1" ||
    !base.port ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error("Capability diagnostic requires isolated loopback hub.");
  }
  const result = {
    checkedAt: new Date().toISOString(),
    status: null as number | null,
    connected: null as boolean | null,
    sourceIdentity: null as number | null,
    sourceSchema: null as number | null,
    sourceConstraints: null as number | null,
    sqlOperations: null as number | null,
    transportError: false,
  };
  try {
    const response = await fetch(
      new URL(`/api/v1/client/me/agents/${encodeURIComponent(agentId)}`, base),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
    result.status = response.status;
    if (!response.ok) {
      return result;
    }
    const raw: unknown = await response.json();
    const record = (v: unknown): Record<string, unknown> | null =>
      v !== null && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    const root = record(record(raw)?.data) ?? record(raw),
      agent = record(root?.agent) ?? root;
    const version = (v: unknown): number | null =>
      typeof v === "number" && Number.isSafeInteger(v) ? v : null;
    result.connected = typeof agent?.isHubConnected === "boolean" ? agent.isHubConnected : null;
    result.sourceIdentity = version(agent?.sourceIdentity);
    result.sourceSchema = version(agent?.sourceSchema);
    result.sourceConstraints = version(agent?.sourceConstraints);
    result.sqlOperations = version(record(agent?.sqlOperations)?.version);
    return result;
  } catch {
    return { ...result, transportError: true };
  }
}
