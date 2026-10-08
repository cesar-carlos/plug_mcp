<script lang="ts">
export default { name: "AnotacoesView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type AnotacaoItem } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import StatusPill from "../components/StatusPill.vue";
import AnotacaoForm from "../components/AnotacaoForm.vue";
import type { AnotacaoAtualizarPayload, AnotacaoCriarPayload } from "../form-payloads";

const { error, run } = useAction();
const lista = ref<AnotacaoItem[]>([]);
const pronto = ref(false);
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
  void run(load).then(() => {
    pronto.value = true;
  });
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
      <label class="choice">
        <input v-model="somenteRevisao" type="checkbox" @change="run(load)" />
        <span>Só revisão pendente</span>
      </label>
      <p v-if="pronto && !error && lista.length === 0" class="empty">
        Nenhuma anotação neste filtro.
      </p>
      <table v-else-if="lista.length > 0" class="data">
        <thead>
          <tr>
            <th>Título</th>
            <th>Tipo</th>
            <th>Vigência</th>
            <th>Revisão</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="nota in lista" :key="nota.id">
            <td>{{ nota.titulo }}</td>
            <td>{{ nota.tipo }}</td>
            <td>
              <StatusPill
                :label="nota.ativaAgora ? 'vigente' : 'fora da vigência'"
                :tone="nota.ativaAgora ? 'ok' : 'neutral'"
              />
            </td>
            <td>
              <StatusPill v-if="nota.revisao.pendente" label="pendente" tone="warn" />
              <span v-else>{{ nota.revisao.proximaEm ?? "—" }}</span>
            </td>
            <td><button class="danger" type="button" @click="remover(nota.id)">Remover</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <AnotacaoForm @criar="criar" @atualizar="atualizar" />
  </Page>
</template>
