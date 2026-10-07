<script lang="ts">
export default { name: "ConsultasView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import JsonBlock from "../components/JsonBlock.vue";
import ConfirmField from "../components/ConfirmField.vue";

const { error, run } = useAction();
const lista = ref<unknown>(null);
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

const load = async (bearer: string | undefined): Promise<void> => {
  lista.value = await api.get("/app/api/consultas", bearer);
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
      <JsonBlock :value="lista" />
    </div>
    <form class="card" @submit.prevent="salvar">
      <h2>Salvar consulta</h2>
      <label>Pergunta <input v-model="pergunta" /></label>
      <label>SQL <textarea v-model="sql" rows="6" /></label>
      <label>skillId <input v-model="skillId" /></label>
      <label>consultaAprendidaId <input v-model="consultaId" /></label>
      <label>confirmacaoHash <input v-model="hash" /></label>
      <ConfirmField v-model="confirmado" />
      <button type="submit">Salvar / confirmar</button>
    </form>
    <form class="card" @submit.prevent="inativar">
      <h2>Inativar consulta</h2>
      <p>
        Usa o ID e o hash do formulário acima. A primeira chamada devolve o hash. A segunda
        confirma. Execução não reativa o exemplo.
      </p>
      <label>Motivo <input v-model="motivo" required /></label>
      <button type="submit">Inativar</button>
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
      <button type="submit">Registrar</button>
    </form>
  </Page>
</template>
