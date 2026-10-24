import type { OutboxClaim } from "../persona-v2/notifications.js";
export interface PersonaOutboxPort {
  claim(): Promise<OutboxClaim | null>;
  authorize(claim: OutboxClaim): Promise<boolean>;
  finish(claim: OutboxClaim, delivered: boolean): Promise<boolean>;
}
export interface PersonaNotificationTransport {
  validate(destination: string): Promise<void>;
  deliver(
    input: { destination: string; secret: string; id: string; body: string; signal: AbortSignal },
    beforeDispatch: () => Promise<void>,
  ): Promise<void>;
}
