import type { PdfFailureDiagnostic } from "../persona-v2/pdf-renderer-failure.js";
export interface PdfJobRow {
  id: string;
  persona_id: string;
  token_id: string;
  namespace: string;
  scope_hash: string;
  request_hash: string;
  request_fingerprint: string;
  request_key_enc: string | null;
  state: string;
  work_deadline: Date;
  artifact_expires_at: Date;
  payload_enc: string | null;
  result_enc: string | null;
  render_token: string | null;
  lease_until: Date | null;
  artifact_hash: string | null;
  support_id: string | null;
}

export interface PdfReportJobsPort {
  admit(input: {
    personaId: string;
    tokenId: string;
    binding: string;
    requestId: string;
    requestJson: string;
    authorityJson?: string;
    timeoutMs: number;
    ttlMs: number;
    authorityExpiresAt: number;
  }): Promise<{ row: PdfJobRow; created: boolean }>;
  get(id: string, binding: string): Promise<PdfJobRow | null>;
  findRequest(requestId: string, binding: string): Promise<PdfJobRow | null>;
  listCandidates(binding: string): Promise<PdfJobRow[]>;
  startCapture(id: string, binding: string): Promise<boolean>;
  sealCapture(id: string, binding: string, payload: string): Promise<void>;
  claimRender(): Promise<PdfJobRow | null>;
  decode(row: PdfJobRow): string;
  finish(
    id: string,
    renderToken: string,
    attachment: string,
    result: Record<string, unknown>,
  ): Promise<string>;
  cancel(id: string, binding: string): Promise<void>;
  expire(): Promise<number>;
  failCapture(
    id: string,
    binding: string,
    supportId: string,
    diagnostic?: PdfFailureDiagnostic,
  ): Promise<void>;
  failRender(
    id: string,
    renderToken: string,
    supportId: string,
    diagnostic?: PdfFailureDiagnostic,
  ): Promise<void>;
  decodeResult(row: PdfJobRow): string;
}
