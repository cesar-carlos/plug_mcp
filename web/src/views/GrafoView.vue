<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { useRoute } from "vue-router";
import { api } from "../api";
import { record, records } from "../validation";
import { askConfirmation } from "../confirmation";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";
import ConfirmField from "../components/ConfirmField.vue";
import SkillSelect from "../components/SkillSelect.vue";
import GrafoJoinForm from "../components/GrafoJoinForm.vue";
import type { GrafoJoinBody } from "../form-payloads";
const route = useRoute();
const { error, pending, success, run } = useAction();
const skillId = ref(typeof route.query.skillId === "string" ? route.query.skillId : "");
const tabelas = ref<unknown>(null);
const filtro = ref("");
const tabela = ref("");
const coluna = ref("");
const descricao = ref("");
const sensibilidade = ref("");
const confirmado = ref(false);
const conflitos = ref<Record<string, unknown>[]>([]);
const conflitoSelecionado = ref("");
const resolucao = ref("");
const conflito = computed(() =>
  conflitoSelecionado.value === "" ? undefined : conflitos.value[Number(conflitoSelecionado.value)],
);
const joinRevision = ref(0);
const colunaSnapshot = (): string =>
  JSON.stringify([tabela.value, coluna.value, descricao.value, sensibilidade.value]);
const colunaOriginal = ref(colunaSnapshot());
useUnsavedChanges(
  computed(() => colunaSnapshot() !== colunaOriginal.value || Boolean(resolucao.value)),
);
watch(skillId, () => {
  confirmado.value = false;
});
const explorar = async (bearer: string | undefined): Promise<void> => {
  tabelas.value = await api.get(
    `/app/api/grafo/tabelas${filtro.value ? `?filtro=${encodeURIComponent(filtro.value)}` : ""}`,
    bearer,
  );
};
const listarConflitos = async (bearer: string | undefined): Promise<void> => {
  conflitos.value = records(record(await api.get("/app/api/grafo/conflitos", bearer)).conflitos);
};
const refresh = async (bearer: string | undefined): Promise<void> => {
  await explorar(bearer);
  await listarConflitos(bearer);
};
onMounted(() => {
  void run(refresh, { feedback: false });
});
const mapear = async (): Promise<void> => {
  await run(async (bearer) => {
    tabelas.value = await api.post("/app/api/grafo/mapear", { tabela: tabela.value }, bearer);
  });
};
const confirmarColuna = async (): Promise<void> => {
  if (!confirmado.value) {
    return;
  }
  await run(async (bearer) => {
    await api.post(
      "/app/api/grafo/coluna",
      {
        skillId: skillId.value || undefined,
        tabela: tabela.value,
        coluna: coluna.value,
        descricao: descricao.value,
        ...(sensibilidade.value ? { sensibilidade: sensibilidade.value } : {}),
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    confirmado.value = false;
    colunaOriginal.value = colunaSnapshot();
    await refresh(bearer);
  });
};
const confirmarJoin = async (body: GrafoJoinBody): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/grafo/relacionamento", body, bearer);
    joinRevision.value += 1;
    await refresh(bearer);
  });
};
const removerJoin = async (body: GrafoJoinBody): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/grafo/relacionamento/remover", body, bearer);
    joinRevision.value += 1;
    await refresh(bearer);
  });
};
const herdar = async (): Promise<void> => {
  const accepted = await askConfirmation({
    title: "Herdar template Se7e?",
    message:
      "O template será incorporado ao grafo deste acesso. Ele não autoriza consultas nem publica skills.",
    action: "Herdar template",
  });
  if (accepted) {
    await run(async (bearer) => {
      await api.post("/app/api/grafo/herdar", { confirmadoPeloUsuario: accepted }, bearer);
      await refresh(bearer);
    });
  }
};
const resolver = async (): Promise<void> => {
  const item = conflito.value;
  if (!item) {
    return;
  }
  const accepted = await askConfirmation({
    title: "Resolver conflito?",
    message: `Confirmar a descrição “${resolucao.value}” para o conflito selecionado?`,
    action: "Resolver conflito",
  });
  if (accepted) {
    await run(async (bearer) => {
      await api.post(
        "/app/api/grafo/conflitos/resolver",
        {
          tabelaId: item.tabelaId,
          colunaId: item.colunaId,
          relacionamentoId: item.relacionamentoId,
          descricao: resolucao.value,
        },
        bearer,
      );
      conflitoSelecionado.value = "";
      resolucao.value = "";
      await refresh(bearer);
    });
  }
};
</script>
<template>
  <Page
    title="Grafo e relações"
    lead="Confirme fatos no grafo ou no rascunho selecionado. Apenas a publicação autoriza consultas."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <div class="context-banner">
      <span>{{
        skillId ? "Destino: rascunho da skill selecionada" : "Destino: somente grafo"
      }}</span
      ><RouterLink v-if="skillId" :to="`/skills/${skillId}`">Voltar à skill</RouterLink>
    </div>
    <div class="card">
      <SkillSelect
        :model-value="skillId"
        label="Destino das confirmações"
        @update:model-value="skillId = typeof $event === 'string' ? $event : ''"
      />
    </div>
    <div class="card">
      <h2>Tabelas</h2>
      <label>Filtro<input v-model="filtro" placeholder="Nome ou parte do nome" /></label>
      <div class="form-actions">
        <button type="button" @click="run(explorar)">Explorar tabelas</button
        ><button class="secondary" type="button" @click="herdar">Herdar template Se7e</button>
      </div>
      <DataView v-if="tabelas" :value="tabelas" empty="Nenhuma tabela neste filtro." />
      <p class="hint">A listagem respeita os limites e a policy do servidor.</p>
    </div>
    <form class="card" @submit.prevent="confirmarColuna">
      <h2>Confirmar coluna</h2>
      <div class="fields-2">
        <label>Tabela<input v-model="tabela" required /></label
        ><label>Coluna<input v-model="coluna" required /></label>
      </div>
      <label>Descrição<input v-model="descricao" /></label
      ><label
        >Classificação<select v-model="sensibilidade">
          <option value="">Preservar classificação confirmada</option>
          <option value="livre">Livre</option>
          <option value="pessoal">Pessoal</option>
          <option value="sensivel">Sensível</option>
          <option value="segredo">Segredo</option>
        </select></label
      ><ConfirmField
        v-model="confirmado"
        label="Confirmo a descrição e a classificação apresentadas"
      />
      <div class="form-actions">
        <button type="submit" :disabled="!confirmado">Confirmar coluna</button
        ><button class="secondary" type="button" :disabled="!tabela" @click="mapear">
          Mapear tabela
        </button>
      </div>
    </form>
    <GrafoJoinForm
      :revision="joinRevision"
      :skill-id="skillId"
      :pending="pending"
      @confirmar="confirmarJoin"
      @remover="removerJoin"
    />
    <form class="card" @submit.prevent="resolver">
      <h2>Conflitos</h2>
      <DataView :value="{ conflitos }" empty="Nenhum conflito neste acesso." /><template
        v-if="conflitos.length"
        ><label
          >Conflito<select v-model="conflitoSelecionado" required>
            <option value="">Selecione</option>
            <option v-for="(item, index) in conflitos" :key="index" :value="String(index)">
              {{ item.tabela || item.join }} {{ item.coluna }} · {{ item.kind }}
            </option>
          </select></label
        ><label>Descrição confirmada<textarea v-model="resolucao" required rows="3" /></label>
        <div class="form-actions"><button type="submit">Revisar resolução</button></div></template
      >
    </form>
  </Page>
</template>
