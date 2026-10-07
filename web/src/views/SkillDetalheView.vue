<script lang="ts">
export default { name: "SkillDetalheView" };
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSkillStore, type ParametroSkillForm } from "../stores/skills";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";
import ParamsEditor from "../components/ParamsEditor.vue";

const route = useRoute();
const router = useRouter();
const skills = useSkillStore();
const { pending, error, run } = useAction();
const nome = ref("");
const descricao = ref("");
const sqlModelo = ref("");
const params = ref<ParametroSkillForm[]>([]);
const tabelas = ref("");
const confirmado = ref(false);

const id = (): string => String(route.params.id);
const fluxo = computed(() => skills.aberta?.fluxoTreino ?? null);
const proximo = computed(() => fluxo.value?.proximoPasso ?? null);

const destino: Record<string, { label: string; to?: string }> = {
  treinar_sql: { label: "Treinar SQL", to: "/treino" },
  descrever_params: { label: "Descrever parâmetros" },
  resolver_conflito: { label: "Resolver conflito", to: "/grafo" },
  listar_conflitos: { label: "Ver conflitos", to: "/grafo" },
  validar_skill: { label: "Validar skill" },
  publicar_skill: { label: "Publicar", to: "" },
  confirmar_coluna: { label: "Confirmar coluna", to: "/grafo" },
  confirmar_relacionamento: { label: "Confirmar JOIN", to: "/grafo" },
  remover_relacionamento: { label: "Remover JOIN", to: "/grafo" },
  mapear_tabela: { label: "Mapear tabela", to: "/grafo" },
  atualizar_skill: { label: "Atualizar a skill" },
  criar_skill: { label: "Skill já criada" },
};

const linkProximo = computed(() => {
  const passo = proximo.value;
  if (!passo) {
    return "";
  }
  return destino[passo]?.to ?? "";
});

const load = async (): Promise<void> => {
  const aberta = await skills.carregar(id());
  nome.value = aberta.nome;
  descricao.value = aberta.descricao;
  sqlModelo.value = aberta.sqlModelo;
  params.value = aberta.params.map((item) => ({ ...item }));
};

onMounted(() => {
  void run(load);
});

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      `/app/api/skills/${encodeURIComponent(id())}`,
      {
        nome: nome.value,
        descricao: descricao.value,
        sqlModelo: sqlModelo.value,
        ...(params.value.length > 0 ? { params: params.value } : {}),
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    await load();
  });
};

const validar = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(`/app/api/skills/${encodeURIComponent(id())}/validar`, {}, bearer);
    await load();
  });
};

const ampliar = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      `/app/api/skills/${encodeURIComponent(id())}/escopo`,
      {
        tabelas: tabelas.value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    await load();
  });
};

const despublicar = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      `/app/api/skills/${encodeURIComponent(id())}/despublicar`,
      { confirmadoPeloUsuario: true },
      bearer,
    );
    await load();
  });
};

const remover = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      `/app/api/skills/${encodeURIComponent(id())}/remover`,
      { confirmadoPeloUsuario: true },
      bearer,
    );
    skills.limpar();
    await router.push({ name: "skills" });
  });
};

const seguir = async (): Promise<void> => {
  const passo = proximo.value;
  if (passo === "validar_skill") {
    await validar();
    return;
  }
  if (passo === "publicar_skill") {
    await router.push({ name: "publicar", params: { id: id() } });
  }
};
</script>

<template>
  <Page :title="nome || 'Skill'" :error="error">
    <div v-if="fluxo" class="card">
      <p>Status: {{ skills.aberta?.status }} · próximo: {{ proximo ?? "concluído" }}</p>
      <ol>
        <li v-for="passo in fluxo.passos" :key="passo.id">
          <strong>{{ passo.id }}</strong> ({{ passo.status }}) — {{ passo.hint }}
        </li>
      </ol>
      <div class="row">
        <button
          v-if="proximo === 'validar_skill' || proximo === 'publicar_skill'"
          type="button"
          @click="seguir"
        >
          {{ destino[proximo]?.label }}
        </button>
        <RouterLink v-else-if="linkProximo" :to="linkProximo">
          {{ proximo ? destino[proximo]?.label : "" }}
        </RouterLink>
        <span v-if="!skills.podePublicar"
          >Publicar fica disponível quando o próximo passo for publicar_skill.</span
        >
      </div>
    </div>
    <form class="card" @submit.prevent="save">
      <label>Nome <input v-model="nome" /></label>
      <label>Descrição <textarea v-model="descricao" rows="3" /></label>
      <label>sqlModelo <textarea v-model="sqlModelo" rows="10" /></label>
      <ParamsEditor v-model="params" />
      <ConfirmField v-model="confirmado" label="Confirmo alterar slug, SQL ou escopo desta skill" />
      <div class="row">
        <button type="submit" :disabled="pending">Salvar rascunho</button>
        <button class="secondary" type="button" :disabled="pending" @click="validar">
          Validar
        </button>
        <button class="secondary" type="button" @click="despublicar">Despublicar</button>
        <button class="danger" type="button" @click="remover">Remover</button>
      </div>
    </form>
    <form class="card" @submit.prevent="ampliar">
      <h2>Ampliar escopo</h2>
      <p>
        Tabelas já treinadas, separadas por vírgula. Sem JOIN confirmado o servidor aponta
        confirmar_coluna.
      </p>
      <label>Tabelas <input v-model="tabelas" placeholder="pedido, cliente" /></label>
      <button type="submit" :disabled="pending">Ampliar</button>
    </form>
  </Page>
</template>
