export interface ReviewWorkerPort {
  claim(owner: string, now: Date, leaseUntil: Date): Promise<boolean>;
  process(owner: string, now: Date): Promise<{ created: number; closed: number }>;
  release(owner: string): Promise<void>;
}
export interface ReviewTask {
  id: string;
  calendarVersion: number;
  dueAt: string;
  createdAt: string;
  closedAt: string | null;
  readAt: string | null;
}
