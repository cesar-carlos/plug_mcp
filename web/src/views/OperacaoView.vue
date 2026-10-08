<script lang="ts">
export default { name: "OperacaoView" };
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, type AlertaItem, type EntregaItem, type LacunaItem } from "../api";
import { useAction } from "../composables/useAction";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { toneForStatus } from "../presentation";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";
import StatusPill from "../components/StatusPill.vue";
import WebhookForm from "../components/WebhookForm.vue";
import type { WebhookConfigurarPayload, WebhookRearmarPayload } from "../form-payloads";
import ErrorBanner from "../components/ErrorBanner.vue";
import ActionStatus from "../components/ActionStatus.vue";
import { listarAlertas, listarLacunas } from "../services/operacao";

const { error, run, pending, success } = useAction();
const auditAction = useAction();
const metricsAction = useAction();
const alertsAction = useAction();
const gapsAction = useAction();
const pronto = ref(false);
const auditoria = ref<unknown>(null);
const metricas = ref<unknown>(null);
const alertas = ref<AlertaItem[]>([]);
const entregas = ref<EntregaItem[]>([]);
const lacunas = ref<LacunaItem[]>([]);
const statusLacuna = ref<"aberta" | "arquivada">("aberta");
const objetivo = ref("");
const entradas = ref("");
const saidas = ref("");
const permissao = ref("");
const teto = ref("");
const aceite = ref("");
const webhookForm = ref<InstanceType<typeof WebhookForm> | null>(null);
const webhookRevision = ref(0);
useUnsavedChanges(
  computed(() =>
    Boolean(
      objetivo.value ||
      entradas.value ||
      saidas.value ||
      permissao.value ||
      teto.value ||
      aceite.value ||
      webhookForm.value?.dirty,
    ),
  ),
);

const load = async (bearer: string | undefined): Promise<void> => {
  await Promise.all([loadAudit(bearer), loadMetrics(bearer), loadAlerts(bearer), loadGaps(bearer)]);
  pronto.value = true;
};
const loadAudit = async (bearer: string | undefined): Promise<void> => {
  await auditAction.run(async (current) => {
    bearer ??= current;
    auditoria.value = await api.get("/app/api/auditoria", bearer);
  });
};
const loadMetrics = async (bearer: string | undefined): Promise<void> => {
  await metricsAction.run(async (current) => {
    bearer ??= current;
    metricas.value = await api.get("/app/api/metricas", bearer);
  });
};
const loadAlerts = async (bearer: string | undefined): Promise<void> => {
  await alertsAction.run(async (current) => {
    bearer ??= current;
    const alertasResult = await listarAlertas(bearer);
    alertas.value = alertasResult.alertas;
    entregas.value = alertasResult.entregas;
  });
};
const loadGaps = async (bearer: string | undefined): Promise<void> => {
  await gapsAction.run(async (current) => {
    bearer ??= current;
    lacunas.value = await listarLacunas(bearer, statusLacuna.value);
  });
};

onMounted(() => {
  void load(undefined);
});

const reconhecer = async (id: string): Promise<void> => {
  await run(async (bearer) => {
    await api.post(`/app/api/alertas/${encodeURIComponent(id)}/reconhecer`, {}, bearer);
    await loadAlerts(bearer);
  });
};

const webhook = async (payload: WebhookConfigurarPayload): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/webhook", payload, bearer);
    webhookRevision.value += 1;
  });
};

const rearmar = async (payload: WebhookRearmarPayload): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/webhook/rearmar", payload, bearer);
    await loadAlerts(bearer);
  });
};

const registrarLacuna = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/lacunas/ferramenta",
      {
        objetivo: objetivo.value,
        entradas: entradas.value,
        saidas: saidas.value,
        permissao: permissao.value,
        teto: teto.value,
        aceite: aceite.value,
      },
      bearer,
    );
    objetivo.value = "";
    entradas.value = "";
    saidas.value = "";
    permissao.value = "";
    teto.value = "";
    aceite.value = "";
    await loadGaps(bearer);
  });
};
</script>

<template>
  <Page
    title="Operação"
    lead="Auditoria e painel só com metadados. URL e segredo do webhook não voltam na resposta."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <div class="card">
      <h2>Métricas</h2>
      <ErrorBanner :error="metricsAction.error.value" /><ActionStatus
        :pending="metricsAction.pending.value"
      />
      <button
        v-if="metricsAction.error.value"
        class="secondary"
        type="button"
        @click="loadMetrics(undefined)"
      >
        Atualizar métricas
      </button>
      <DataView v-if="metricas" :value="metricas" empty="Nenhuma métrica nesta janela." />
      <p v-else-if="!metricsAction.pending.value && !metricsAction.error.value" class="empty">
        Nenhuma métrica carregada.
      </p>
    </div>
    <div class="card">
      <h2>Auditoria</h2>
      <ErrorBanner :error="auditAction.error.value" /><ActionStatus
        :pending="auditAction.pending.value"
      />
      <button
        v-if="auditAction.error.value"
        class="secondary"
        type="button"
        @click="loadAudit(undefined)"
      >
        Atualizar auditoria
      </button>
      <p class="hint">Últimos eventos, dentro do limite do servidor.</p>
      <DataView v-if="auditoria" :value="auditoria" empty="Nenhum evento de auditoria." />
      <p v-else-if="!auditAction.pending.value && !auditAction.error.value" class="empty">
        Nenhuma auditoria carregada.
      </p>
    </div>
    <div class="card">
      <h2>Alertas</h2>
      <ErrorBanner :error="alertsAction.error.value" /><ActionStatus
        :pending="alertsAction.pending.value"
      />
      <p class="hint">Até 50 alertas e entregas recentes.</p>
      <button
        v-if="alertsAction.error.value"
        class="secondary"
        type="button"
        @click="loadAlerts(undefined)"
      >
        Atualizar alertas
      </button>
      <p
        v-if="
          pronto && !alertsAction.error.value && !alertsAction.pending.value && alertas.length === 0
        "
        class="empty"
      >
        Nenhum alerta.
      </p>
      <div v-else-if="alertas.length > 0" class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Severidade</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="alerta in alertas" :key="alerta.id">
              <td>{{ alerta.categoria }}</td>
              <td>
                <StatusPill :label="alerta.severidade" :tone="toneForStatus(alerta.severidade)" />
              </td>
              <td>
                <StatusPill :label="alerta.status" :tone="toneForStatus(alerta.status)" />
              </td>
              <td>
                <button
                  v-if="alerta.status === 'aberto'"
                  type="button"
                  @click="reconhecer(alerta.id)"
                >
                  Reconhecer
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>Lacunas</h2>
      <ErrorBanner :error="gapsAction.error.value" /><ActionStatus
        :pending="gapsAction.pending.value"
      />
      <label>
        Status
        <select
          v-model="statusLacuna"
          :disabled="gapsAction.pending.value"
          @change="loadGaps(undefined)"
        >
          <option value="aberta">aberta</option>
          <option value="arquivada">arquivada</option>
        </select>
      </label>
      <p class="hint">Lista dentro do limite do servidor.</p>
      <button
        v-if="gapsAction.error.value"
        class="secondary"
        type="button"
        @click="loadGaps(undefined)"
      >
        Atualizar lacunas
      </button>
      <p
        v-if="
          pronto && !gapsAction.error.value && !gapsAction.pending.value && lacunas.length === 0
        "
        class="empty"
      >
        Nenhuma lacuna neste status.
      </p>
      <div v-else-if="lacunas.length > 0" class="table-scroll">
        <table class="data">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Status</th>
              <th>Pergunta</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lacuna in lacunas" :key="lacuna.id">
              <td>{{ lacuna.tipo }}</td>
              <td>
                <StatusPill :label="lacuna.status" :tone="toneForStatus(lacuna.status)" />
              </td>
              <td>{{ lacuna.pergunta }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <form class="card" @submit.prevent="registrarLacuna">
      <h2>Lacuna de ferramenta</h2>
      <label>Objetivo <input v-model="objetivo" required /></label>
      <label>Entradas <input v-model="entradas" /></label>
      <label>Saídas <input v-model="saidas" /></label>
      <label>Permissão <input v-model="permissao" /></label>
      <label>Teto <input v-model="teto" /></label>
      <label>Aceite <input v-model="aceite" /></label>
      <div class="form-actions">
        <button type="submit">Registrar</button>
      </div>
    </form>
    <WebhookForm
      ref="webhookForm"
      :entregas="entregas"
      :pending="pending"
      :revision="webhookRevision"
      @configurar="webhook"
      @rearmar="rearmar"
    />
  </Page>
</template>
