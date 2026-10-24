import {
  PERSONA_VAULT_TARGETS,
  type VaultRotationJob,
  type VaultTarget,
} from "../../domain/persona-v2/vault-rotation.js";
import type {
  PersonaVaultRotationStore,
  VaultCipherRow,
  VaultRotationCipher,
  VaultRotationSession,
} from "../../domain/ports/persona-vault-rotation.port.js";

export interface PersonaVaultRotationInput {
  apply: boolean;
  keyId: string;
  confirmDatabase?: string;
  resumeId?: string;
  batchSize?: number;
  maxBatches?: number;
}
export interface PersonaVaultRotationResult {
  mode: "simulation" | "apply";
  checked: number;
  changed: number;
  status: "simulated" | "running" | "completed";
  runId?: string;
  keyId: string;
}

export class PersonaVaultRotation {
  constructor(
    private readonly store: PersonaVaultRotationStore,
    private readonly cipher: VaultRotationCipher,
  ) {}

  private transform(target: VaultTarget, row: VaultCipherRow, keyId: string) {
    const replacements: Record<string, string> = {};
    let checked = 0;
    for (const field of target.fields) {
      const encrypted = row.content[field];
      if (encrypted === null) continue;
      if (
        typeof encrypted !== "string" ||
        !encrypted.startsWith("v2.") ||
        encrypted.length > 32 * 1024 * 1024
      ) {
        throw new Error("Invalid persona vault envelope");
      }
      const plain = this.cipher.decrypt(encrypted);
      checked++;
      if (encrypted.split(".")[1] === keyId) continue;
      const next = this.cipher.encrypt(plain);
      if (!next.startsWith(`v2.${keyId}.`) || this.cipher.decrypt(next) !== plain) {
        throw new Error("Vault rewrap verification failed");
      }
      replacements[field] = next;
    }
    return { checked, replacements };
  }

  private async simulate(session: VaultRotationSession, keyId: string, size: number) {
    return session.transaction(true, async (unit) => {
      let checked = 0,
        changed = 0;
      for (const target of PERSONA_VAULT_TARGETS) {
        let cursor: Record<string, unknown> | null = null;
        for (;;) {
          const rows = await unit.scan(target, cursor, size, false);
          if (!rows.length) break;
          for (const row of rows) {
            const next = this.transform(target, row, keyId);
            checked += next.checked;
            changed += Object.keys(next.replacements).length;
          }
          cursor = rows.at(-1)!.key;
        }
      }
      return { checked, changed };
    });
  }

  async run(input: PersonaVaultRotationInput): Promise<PersonaVaultRotationResult> {
    const size = input.batchSize ?? 20,
      maxBatches = input.maxBatches ?? Number.MAX_SAFE_INTEGER;
    const bindings = this.cipher.keyFingerprints();
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(input.keyId) ||
      !bindings[input.keyId] ||
      Object.entries(bindings).some(
        ([id, value]) => id !== input.keyId && value === bindings[input.keyId],
      ) ||
      Object.entries(bindings).some(
        ([id, value]) => !/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^[a-f0-9]{64}$/.test(value),
      ) ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 100 ||
      !Number.isSafeInteger(maxBatches) ||
      maxBatches < 1 ||
      (input.resumeId && !/^[a-f0-9-]{36}$/i.test(input.resumeId)) ||
      (!input.apply &&
        (input.resumeId !== undefined ||
          input.confirmDatabase !== undefined ||
          input.maxBatches !== undefined))
    ) {
      throw new Error("Invalid vault rotation options");
    }
    return this.store.exclusive(async (session) => {
      if (input.apply && input.confirmDatabase !== session.databaseName)
        throw new Error("Explicit database confirmation required");
      await session.validateBindings(input.keyId, bindings);
      const simulation = await this.simulate(session, input.keyId, size);
      if (!input.apply)
        return { mode: "simulation", status: "simulated", keyId: input.keyId, ...simulation };
      let job = await session.transaction(false, (unit) =>
        unit.start(input.keyId, bindings, input.resumeId),
      );
      if (job.status === "completed" && simulation.changed)
        throw new Error("Completed vault run still has old envelopes");
      for (
        let n = 0;
        job.status === "running" && job.tableIndex < PERSONA_VAULT_TARGETS.length && n < maxBatches;
        n++
      ) {
        job = await session.transaction(false, async (unit) => {
          const target = PERSONA_VAULT_TARGETS[job.tableIndex]!;
          const rows = await unit.scan(target, job.cursor, size, true);
          let next: VaultRotationJob = { ...job };
          for (const row of rows) {
            const transformed = this.transform(target, row, input.keyId);
            if (Object.keys(transformed.replacements).length)
              await unit.rewrap(job, target, row, transformed.replacements);
            next = {
              ...next,
              cursor: row.key,
              checked: next.checked + transformed.checked,
              changed: next.changed + Object.keys(transformed.replacements).length,
            };
          }
          if (!rows.length) next = { ...next, tableIndex: next.tableIndex + 1, cursor: null };
          await unit.progress(next);
          return next;
        });
      }
      if (job.status === "running" && job.tableIndex === PERSONA_VAULT_TARGETS.length) {
        const final = await this.simulate(session, input.keyId, size);
        if (final.changed) throw new Error("Vault still contains old envelopes");
        job = { ...job, status: "completed" };
        await session.transaction(false, (unit) => unit.progress(job));
      }
      return {
        mode: "apply",
        status: job.status,
        keyId: job.keyId,
        runId: job.id,
        checked: job.checked,
        changed: job.changed,
      };
    });
  }
}
