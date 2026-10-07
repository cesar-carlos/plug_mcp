<script lang="ts">
export default { name: "AnotacoesView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type AnotacaoItem } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import AnotacaoForm from "../components/AnotacaoForm.vue";
import type { AnotacaoAtualizarPayload, AnotacaoCriarPayload } from "../form-payloads";

const { error, run } = useAction();
const lista = ref<AnotacaoItem[]>([]);
const somenteRevisao = ref(false);

const load = async (bearer: string | undefined): Promise<void> => {
  const query = somenteRevisao.value ? "?somenteRevisaoPendente=true" : "";
  const result = await api.get<{ success: true; anotacoes: AnotacaoItem[] }>(
    `/app/api/anotacoes${query}`,
    bearer,
  );
  lista.value = result.anotacoes;
};

onMounted(() => {
  void run(load);
});

const criar = async (payload: AnotacaoCriarPayload): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/anotacoes", payload, bearer);
    await load(bearer);
  });
};

const atualizar = async (payload: AnotacaoAtualizarPayload): Promise<void> => {
  await run(async (bearer) => {
    const { anotacaoId, ...body } = payload;
    await api.post(`/app/api/anotacoes/${encodeURIComponent(anotacaoId)}`, body, bearer);
    await load(bearer);
  });
};

const remover = async (id: string): Promise<void> => {
  await run(async (bearer) => {
    await api.post(`/app/api/anotacoes/${encodeURIComponent(id)}/remover`, {}, bearer);
    await load(bearer);
  });
};
</script>

<template>
  <Page
    title="Anotações"
    lead="Vigência e fila de revisão não licenciam SQL. Atualizar exige confirmação."
    :error="error"
  >
    <div class="card">
      <label
        ><input v-model="somenteRevisao" type="checkbox" @change="run(load)" /> Só revisão
        pendente</label
      >
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Tipo</th>
            <th>Ativa</th>
            <th>Revisão</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="nota in lista" :key="nota.id">
            <td>{{ nota.titulo }}</td>
            <td>{{ nota.tipo }}</td>
            <td>{{ nota.ativaAgora ? "sim" : "não" }}</td>
            <td>{{ nota.revisao.pendente ? "pendente" : (nota.revisao.proximaEm ?? "—") }}</td>
            <td><button class="danger" type="button" @click="remover(nota.id)">Remover</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AnotacaoForm @criar="criar" @atualizar="atualizar" />
  </Page>
</template>
