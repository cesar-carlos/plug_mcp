<script lang="ts">
export default { name: "ConsultasView" };
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { toneForStatus } from "../presentation";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import StatusPill from "../components/StatusPill.vue";

interface ConsultaResumo {
  id: string;
  pergunta: string;
  status: string;
  skillIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const { error, run } = useAction();
const lista = ref<unknown>(null);
const abertaId = ref<string | null>(null);
const sqlPorId = ref<Record<string, string>>({});
const erroConsulta = ref<unknown>(null);
const pergunta = ref("");
const sql = ref("");
const skillId = ref("");
const tipo = ref("sinonimo");
const titulo = ref("");
const texto = ref("");
const confirmado = ref(false);
const hash = ref("");
const consultaId = ref("");
const motivo = ref("");

const consultas = computed((): ConsultaResumo[] => {
  if (!isRecord(lista.value) || !Array.isArray(lista.value.consultas)) {
    return [];
  }
  return lista.value.consultas.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      return [];
    }
    const skillIds = Array.isArray(item.skillIds)
      ? item.skillIds.filter((skillId): skillId is string => typeof skillId === "string")
      : [];
    return [
      {
        id: item.id,
        pergunta: typeof item.pergunta === "string" ? item.pergunta : item.id,
        status: typeof item.status === "string" ? item.status : "—",
        skillIds,
      },
    ];
  });
});

const load = async (bearer: string | undefined): Promise<void> => {
  lista.value = await api.get("/app/api/consultas", bearer);
};

const abrir = async (id: string): Promise<void> => {
  if (abertaId.value === id) {
    abertaId.value = null;
    return;
  }
  abertaId.value = id;
  if (sqlPorId.value[id]) {
    return;
  }
  erroConsulta.value = null;
  await run(async (bearer) => {
    try {
      const result = await api.get<{ consulta?: { sql?: string } }>(
        `/app/api/consultas/${encodeURIComponent(id)}`,
        bearer,
      );
      sqlPorId.value = { ...sqlPorId.value, [id]: result.consulta?.sql ?? "" };
    } catch (caught) {
      erroConsulta.value = caught;
    }
  });
};

const levar = (item: ConsultaResumo): void => {
  pergunta.value = item.pergunta;
  consultaId.value = item.id;
  sql.value = sqlPorId.value[item.id] ?? "";
  skillId.value = item.skillIds[0] ?? "";
  confirmado.value = false;
  hash.value = "";
};

onMounted(() => {
  void run(load);
});

const hashFrom = (payload: unknown): string | undefined => {
  if (payload && typeof payload === "object" && "confirmacaoHash" in payload) {
    const value = payload.confirmacaoHash;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
};

const salvar = async (): Promise<void> => {
  await run(async (bearer) => {
    const result = await api.post(
      "/app/api/consultas/salvar",
      {
        pergunta: pergunta.value,
        sql: sql.value,
        skillId: skillId.value || undefined,
        consultaAprendidaId: consultaId.value || undefined,
        confirmacaoHash: hash.value || undefined,
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    const nextHash = hashFrom(result);
    if (nextHash) {
      hash.value = nextHash;
    }
    await load(bearer);
  });
};

const inativar = async (): Promise<void> => {
  await run(async (bearer) => {
    const result = await api.post(
      `/app/api/consultas/${encodeURIComponent(consultaId.value)}/inativar`,
      {
        motivo: motivo.value,
        confirmacaoHash: hash.value || undefined,
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    const nextHash = hashFrom(result);
    if (nextHash) {
      hash.value = nextHash;
    }
    await load(bearer);
  });
};

const aprendizado = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/aprendizado",
      {
        tipo: tipo.value,
        titulo: titulo.value,
        texto: texto.value,
        skillId: skillId.value || undefined,
      },
      bearer,
    );
  });
};
</script>

<template>
  <Page
    title="Consultas e aprendizado"
    lead="Salvar consulta exige preview e confirmação. Candidata não vira reuso sozinha."
    :error="error"
  >
    <div class="card">
      <h2>Nesta persona</h2>
      <p v-if="consultas.length === 0" class="empty">Nenhuma consulta neste acesso.</p>
      <div v-for="item in consultas" :key="item.id" class="data-block">
        <button class="card-toggle" type="button" @click="abrir(item.id)">
          <span class="card-toggle-main">{{ item.pergunta }}</span>
          <StatusPill :label="item.status" :tone="toneForStatus(item.status)" />
          <span class="hint">{{ abertaId === item.id ? "Fechar" : "Ver SQL" }}</span>
        </button>
        <template v-if="abertaId === item.id">
          <ErrorBanner v-if="erroConsulta && !sqlPorId[item.id]" :error="erroConsulta" />
          <pre v-if="sqlPorId[item.id]" class="code">{{ sqlPorId[item.id] }}</pre>
          <p class="hint">
            Este texto não grava por cima do exemplo. Para substituir, leve ao formulário Salvar
            consulta: a primeira chamada só devolve o hash.
          </p>
          <div class="form-actions">
            <button
              class="secondary"
              type="button"
              :disabled="!sqlPorId[item.id]"
              @click="levar(item)"
            >
              Levar para salvar
            </button>
          </div>
        </template>
      </div>
    </div>
    <form class="card" @submit.prevent="salvar">
      <h2>Salvar consulta</h2>
      <label>Pergunta <input v-model="pergunta" /></label>
      <label>SQL <textarea v-model="sql" rows="6" /></label>
      <div class="fields-2">
        <label>skillId <input v-model="skillId" /></label>
        <label>consultaAprendidaId <input v-model="consultaId" /></label>
      </div>
      <label>
        confirmacaoHash
        <input v-model="hash" class="mono" spellcheck="false" />
        <span class="hint">A primeira chamada devolve o hash. A segunda confirma com ele.</span>
      </label>
      <ConfirmField v-model="confirmado" label="Confirmo salvar este exemplo no pacote atual" />
      <div class="form-actions">
        <button type="submit">Salvar / confirmar</button>
      </div>
    </form>
    <form class="card" @submit.prevent="inativar">
      <h2>Inativar consulta</h2>
      <p>
        Usa o ID e o hash do formulário acima. A primeira chamada devolve o hash. A segunda
        confirma. Execução não reativa o exemplo.
      </p>
      <label>Motivo <input v-model="motivo" required /></label>
      <div class="form-actions">
        <button class="danger" type="submit">Inativar</button>
      </div>
    </form>
    <form class="card" @submit.prevent="aprendizado">
      <h2>Registrar aprendizado</h2>
      <label>
        Tipo
        <select v-model="tipo">
          <option>sinonimo</option>
          <option>regra</option>
          <option>metrica</option>
          <option>glossario</option>
          <option>dicionario</option>
        </select>
      </label>
      <label>Título <input v-model="titulo" /></label>
      <label>Texto <textarea v-model="texto" rows="4" /></label>
      <div class="form-actions">
        <button type="submit">Registrar</button>
      </div>
    </form>
  </Page>
</template>
