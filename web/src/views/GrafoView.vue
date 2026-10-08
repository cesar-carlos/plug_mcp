<script lang="ts">
export default { name: "GrafoView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";
import ConfirmField from "../components/ConfirmField.vue";
import GrafoJoinForm from "../components/GrafoJoinForm.vue";
import type { GrafoJoinBody } from "../form-payloads";

const { error, run } = useAction();
const tabelas = ref<unknown>(null);
const filtro = ref("");
const tabela = ref("");
const coluna = ref("");
const descricao = ref("");
const confirmado = ref(false);
const conflitos = ref<unknown>(null);

const explorar = async (bearer: string | undefined): Promise<void> => {
  tabelas.value = await api.get(
    `/app/api/grafo/tabelas${filtro.value ? `?filtro=${encodeURIComponent(filtro.value)}` : ""}`,
    bearer,
  );
};

const listarConflitos = async (bearer: string | undefined): Promise<void> => {
  conflitos.value = await api.get("/app/api/grafo/conflitos", bearer);
};

onMounted(() => {
  void run(async (bearer) => {
    await explorar(bearer);
    await listarConflitos(bearer);
  });
});

const mapear = async (): Promise<void> => {
  await run(async (bearer) => {
    tabelas.value = await api.post("/app/api/grafo/mapear", { tabela: tabela.value }, bearer);
  });
};

const confirmarColuna = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/grafo/coluna",
      {
        tabela: tabela.value,
        coluna: coluna.value,
        descricao: descricao.value,
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
  });
};

const confirmarJoin = async (body: GrafoJoinBody): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/grafo/relacionamento", body, bearer);
  });
};

const removerJoin = async (body: GrafoJoinBody): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/grafo/relacionamento/remover", body, bearer);
  });
};

const herdar = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/grafo/herdar", { confirmadoPeloUsuario: true }, bearer);
  });
};
</script>

<template>
  <Page
    title="Grafo"
    lead="Explorar e mapear não licenciam consulta. JOIN no grafo sem skillId não entra no pacote publicado."
    :error="error"
  >
    <div class="card">
      <h2>Tabelas</h2>
      <label>
        Filtro
        <input v-model="filtro" placeholder="Nome ou parte do nome" />
      </label>
      <div class="form-actions">
        <button type="button" @click="run(explorar)">Explorar tabelas</button>
        <button class="secondary" type="button" @click="herdar">Herdar template Se7e</button>
      </div>
      <DataView v-if="tabelas" :value="tabelas" empty="Nenhuma tabela neste filtro." />
      <p v-else class="empty">Nenhuma tabela listada ainda.</p>
    </div>
    <div class="card">
      <h2>Mapear coluna</h2>
      <div class="fields-2">
        <label>Tabela <input v-model="tabela" /></label>
        <label>Coluna <input v-model="coluna" /></label>
      </div>
      <label>Descrição <input v-model="descricao" /></label>
      <ConfirmField v-model="confirmado" label="Confirmo a descrição desta coluna" />
      <div class="form-actions">
        <button type="button" @click="mapear">Mapear tabela</button>
        <button class="secondary" type="button" @click="confirmarColuna">Confirmar coluna</button>
      </div>
    </div>
    <GrafoJoinForm @confirmar="confirmarJoin" @remover="removerJoin" />
    <div class="card">
      <h2>Conflitos</h2>
      <DataView v-if="conflitos" :value="conflitos" empty="Nenhum conflito neste acesso." />
      <p v-else class="empty">Nenhum conflito carregado.</p>
    </div>
  </Page>
</template>
