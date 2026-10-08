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
import { askConfirmation } from "../confirmation";
import { listarAnotacoes } from "../services/anotacoes";

const { error, pending, success, run } = useAction();
const selecionada = ref<AnotacaoItem | null>(null);
const revision = ref(0);
const formulario = ref<InstanceType<typeof AnotacaoForm> | null>(null);
const selecionar = async (nota: AnotacaoItem | null): Promise<void> => {
  if (
    formulario.value?.dirty &&
    !(await askConfirmation({
      title: "Descartar edição da anotação?",
      message: "As alterações locais serão descartadas.",
      action: "Descartar",
    }))
  ) {
    return;
  }
  selecionada.value = nota;
  revision.value += 1;
};
const lista = ref<AnotacaoItem[]>([]);
const pronto = ref(false);
const somenteRevisao = ref(false);

const load = async (bearer: string | undefined): Promise<void> => {
  lista.value = await listarAnotacoes(bearer, somenteRevisao.value);
};

onMounted(() => {
  void run(load, { feedback: false }).then(() => {
    pronto.value = true;
  });
});

const criar = async (payload: AnotacaoCriarPayload): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/anotacoes", payload, bearer);
    revision.value += 1;
    await load(bearer);
  });
};

const atualizar = async (payload: AnotacaoAtualizarPayload): Promise<void> => {
  await run(async (bearer) => {
    const { anotacaoId, ...body } = payload;
    await api.post(`/app/api/anotacoes/${encodeURIComponent(anotacaoId)}`, body, bearer);
    selecionada.value = null;
    revision.value += 1;
    await load(bearer);
  });
};

const remover = async (id: string): Promise<void> => {
  if (
    !(await askConfirmation({
      title: "Remover anotação?",
      message: `A anotação “${lista.value.find((item) => item.id === id)?.titulo ?? ""}” será apagada.`,
      action: "Remover anotação",
      danger: true,
    }))
  ) {
    return;
  }
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
    :pending="pending"
    :success="success"
  >
    <div class="card">
      <label class="choice">
        <input v-model="somenteRevisao" type="checkbox" @change="run(load)" />
        <span>Só revisão pendente</span>
      </label>
      <p v-if="pronto && !error && lista.length === 0" class="empty">
        Nenhuma anotação neste filtro.
      </p>
      <div v-else-if="lista.length > 0" class="table-scroll">
        <table class="data">
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
              <td>
                <div class="row">
                  <button class="secondary" type="button" @click="selecionar(nota)">Editar</button
                  ><button class="danger" type="button" @click="remover(nota.id)">Remover</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <AnotacaoForm
      ref="formulario"
      :anotacao="selecionada"
      :pending="pending"
      :revision="revision"
      @criar="criar"
      @atualizar="atualizar"
      @cancelar="selecionar(null)"
    />
  </Page>
</template>
