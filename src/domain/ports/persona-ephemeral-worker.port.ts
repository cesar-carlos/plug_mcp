export interface EphemeralCleanupCounts {
  setups: number;
  oauthRecords: number;
  publicationPreviews: number;
  structurePreviews: number;
  physicalPreviews: number;
  knowledgeCurationPreviews: number;
  physicalCurationPreviews: number;
  reviewBindings: number;
  interactionTexts: number;
  attachments: number;
  outboxMetadata: number;
}

export interface PersonaEphemeralWorkerPort {
  claim(owner: string, now: Date, leaseUntil: Date): Promise<boolean>;
  process(owner: string, now: Date): Promise<EphemeralCleanupCounts>;
  release(owner: string): Promise<void>;
}
