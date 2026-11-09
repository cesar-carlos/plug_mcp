/** Fixed diagnostic vocabulary; never include URLs, identifiers or credentials. */
export const PLUG_SERVER_STAGES = [
  "login",
  "refresh",
  "getClientProfile",
  "getAgentAccessStatus",
  "requestAgentAccess",
  "getAgentAccessRequests",
  "updateClientToken",
  "getPolicy",
  "sql.execute",
  "sql.describeSchema",
  "sql.describeSource",
  "sql.operation.execute",
  "sql.operation.get",
  "sql.operation.cancel",
  "rpc",
] as const;

export const PLUG_SERVER_PHASE_STAGES = PLUG_SERVER_STAGES.flatMap((stage) =>
  (["queue", "connection", "response"] as const).map((phase) => `${stage}.${phase}` as const),
);
