import type {
  ExternalFixtureControl,
  ExternalRunManifest,
} from "../../domain/persona-v2/external-run.js";
import type {
  ExternalConnection,
  ExternalTransport,
  ExternalActionTransport,
  ExternalContract,
} from "../../domain/persona-v2/external-contract.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
const field = (type: "string" | "boolean") => ({
  type,
  required: true,
  purpose: "Controle de fixture isolada",
  classification: "livre" as const,
});
/** Fixed fixture protocol. Control calls never target the intended operational integration. */
export class ExternalHttpsFixtureControl implements ExternalFixtureControl {
  constructor(private readonly adapter: ExternalTransport & ExternalActionTransport) {}
  private contract(run: ExternalRunManifest, cleanup: boolean): ExternalContract {
    return {
      operationId: run.runId,
      integrationId: run.fixtureIntegrationId,
      purpose: "Atestar/limpar somente rodada de fixture",
      effect: cleanup ? "acao" : "consulta",
      ...(cleanup
        ? {
            approval: "automatic" as const,
            effectDescription: "Remover dados sintéticos da rodada",
            reconciliation: "Não repetir cleanup incerto; investigar fixture",
          }
        : {}),
      transport: {
        kind: "rest",
        method: cleanup ? "POST" : "GET",
        path: cleanup ? "/_se7e_fixture/cleanup" : "/_se7e_fixture/status",
      },
      input: { runId: field("string"), packageHash: field("string") },
      output: cleanup
        ? { runId: field("string"), cleaned: field("boolean") }
        : {
            runId: field("string"),
            packageHash: field("string"),
            isolated: field("boolean"),
            ready: field("boolean"),
          },
      timeoutMs: 3000,
      maxResponseBytes: 4096,
    };
  }
  async verify(
    fixture: ExternalConnection,
    run: ExternalRunManifest,
    signal: AbortSignal,
  ): Promise<void> {
    const result = (await this.adapter.invoke(
      fixture,
      this.contract(run, false),
      { runId: run.runId, packageHash: run.packageHash },
      signal,
      () => Promise.resolve(),
    )) as Record<string, unknown>;
    if (
      result.runId !== run.runId ||
      result.packageHash !== run.packageHash ||
      result.isolated !== true ||
      result.ready !== true
    )
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Ownership de fixture não confirmado.");
  }
  async cleanup(
    fixture: ExternalConnection,
    run: ExternalRunManifest,
    signal: AbortSignal,
  ): Promise<void> {
    const result = (await this.adapter.executeAction(
      fixture,
      this.contract(run, true),
      { runId: run.runId, packageHash: run.packageHash },
      signal,
      () => Promise.resolve(),
      () => Promise.resolve(),
    )) as Record<string, unknown>;
    if (result.runId !== run.runId || result.cleaned !== true)
      throw new PersonaV2Error(
        "CAPABILITY_UNAVAILABLE",
        "Limpeza da rodada não confirmada; não repita efeitos.",
      );
  }
}
