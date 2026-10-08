<script lang="ts">
export default { name: "OperacaoView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type AlertaItem, type EntregaItem, type LacunaItem } from "../api";
import { useAction } from "../composables/useAction";
import { toneForStatus } from "../presentation";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";
import StatusPill from "../components/StatusPill.vue";
import WebhookForm from "../components/WebhookForm.vue";
import type { WebhookConfigurarPayload, WebhookRearmarPayload } from "../form-payloads";

const { error, run } = useAction();
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

const load = async (bearer: string | undefined): Promise<void> => {
  auditoria.value = await api.get("/app/api/auditoria", bearer);
  metricas.value = await api.get("/app/api/metricas", bearer);
  const alertasResult = await api.get<{
    success: true;
    alertas: AlertaItem[];
    entregas: EntregaItem[];
  }>("/app/api/alertas", bearer);
  alertas.value = alertasResult.alertas;
  entregas.value = alertasResult.entregas;
  const lacunasResult = await api.get<{ success: true; lacunas: LacunaItem[] }>(
    `/app/api/lacunas?status=${statusLacuna.value}`,
    bearer,
  );
  lacunas.value = lacunasResult.lacunas;
};

onMounted(() => {
  void run(load).then(() => {
    pronto.value = true;
  });
});

const reconhecer = async (id: string): Promise<void> => {
  await run(async (bearer) => {
    await api.post(`/app/api/alertas/${encodeURIComponent(id)}/reconhecer`, {}, bearer);
    await load(bearer);
  });
};

const webhook = async (payload: WebhookConfigurarPayload): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/webhook", payload, bearer);
  });
};

const rearmar = async (payload: WebhookRearmarPayload): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/webhook/rearmar", payload, bearer);
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
    await load(bearer);
  });
};
</script>

<template>
  <Page
    title="Operação"
    lead="Auditoria e painel só com metadados. URL e segredo do webhook não voltam na resposta."
    :error="error"
  >
    <div class="card">
      <h2>Métricas</h2>
      <DataView v-if="metricas" :value="metricas" empty="Nenhuma métrica nesta janela." />
      <p v-else class="empty">Nenhuma métrica carregada.</p>
    </div>
    <div class="card">
      <h2>Auditoria</h2>
      <DataView v-if="auditoria" :value="auditoria" empty="Nenhum evento de auditoria." />
      <p v-else class="empty">Nenhuma auditoria carregada.</p>
    </div>
    <div class="card">
      <h2>Alertas</h2>
      <p v-if="pronto && !error && alertas.length === 0" class="empty">Nenhum alerta.</p>
      <table v-else-if="alertas.length > 0" class="data">
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
    <div class="card">
      <h2>Lacunas</h2>
      <label>
        Status
        <select v-model="statusLacuna" @change="run(load)">
          <option value="aberta">aberta</option>
          <option value="arquivada">arquivada</option>
        </select>
      </label>
      <p v-if="pronto && !error && lacunas.length === 0" class="empty">
        Nenhuma lacuna neste status.
      </p>
      <table v-else-if="lacunas.length > 0" class="data">
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
    <WebhookForm :entregas="entregas" @configurar="webhook" @rearmar="rearmar" />
  </Page>
</template>
