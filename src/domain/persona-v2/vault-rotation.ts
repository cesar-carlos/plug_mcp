export const PERSONA_VAULT_TARGETS = [
  {
    table: "fonte_credencial",
    keys: ["id"],
    fields: ["email_enc", "senha_enc", "client_token_enc"],
  },
  { table: "integracao", keys: ["id"], fields: ["credencial_enc"] },
  { table: "responsavel_delegacao_v2", keys: ["persona_id"], fields: ["credential_enc"] },
  { table: "operacao_v2", keys: ["id"], fields: ["payload_enc"] },
  { table: "external_action_v2", keys: ["id"], fields: ["payload_enc", "result_enc"] },
  { table: "outbox_v2", keys: ["id"], fields: ["destino_enc", "segredo_enc"] },
  { table: "setup_v2", keys: ["code_hash"], fields: ["contexto_enc"] },
  { table: "oauth_registro_v2", keys: ["id_hash"], fields: ["conteudo_enc"] },
  {
    table: "knowledge_library_version_v2",
    keys: ["catalog_id", "library_id", "version"],
    fields: ["payload_enc"],
  },
  {
    table: "persona_notification_endpoint_v2",
    keys: ["persona_id"],
    fields: ["destino_enc", "segredo_enc"],
  },
  { table: "persona_attachment_v2", keys: ["handle_hash"], fields: ["payload_enc"] },
] as const;
export type VaultTarget = (typeof PERSONA_VAULT_TARGETS)[number];
export interface VaultRotationJob {
  id: string;
  keyId: string;
  fingerprint: string;
  status: "running" | "completed";
  tableIndex: number;
  cursor: Record<string, unknown> | null;
  checked: number;
  changed: number;
}
