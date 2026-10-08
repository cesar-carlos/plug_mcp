<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { askConfirmation } from "../confirmation";
import { useAction } from "../composables/useAction";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { useSkillStore, type ParametroSkillForm } from "../stores/skills";
import { passoLabel, statusLabel } from "../presentation";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";
import ParamsEditor from "../components/ParamsEditor.vue";
import StatusPill from "../components/StatusPill.vue";
import SqlField from "../components/SqlField.vue";
const route = useRoute();
const router = useRouter();
const skills = useSkillStore();
const { pending, error, success, run } = useAction();
const nome = ref("");
const descricao = ref("");
const sqlModelo = ref("");
const params = ref<ParametroSkillForm[]>([]);
const tabelas = ref("");
const confirmado = ref(false);
const confirmaEscopo = ref(false);
const original = ref("");
const validacaoPendente = ref(false);
const snapshot = (): string =>
  JSON.stringify({
    nome: nome.value,
    descricao: descricao.value,
    sqlModelo: sqlModelo.value,
    params: params.value,
  });
const dirty = computed(() => original.value !== "" && snapshot() !== original.value);
useUnsavedChanges(dirty);
const id = String(route.params.id);
const fluxo = computed(() => skills.aberta?.fluxoTreino ?? null);
const proximo = computed(() => fluxo.value?.proximoPasso ?? null);
const linkProximo = computed(() => {
  const paths: Record<string, string> = {
    treinar_sql: "/treino",
    confirmar_coluna: "/grafo",
    confirmar_relacionamento: "/grafo",
    remover_relacionamento: "/grafo",
    resolver_conflito: "/grafo",
    listar_conflitos: "/grafo",
    mapear_tabela: "/grafo",
  };
  return proximo.value && paths[proximo.value]
    ? { path: paths[proximo.value], query: { skillId: id } }
    : undefined;
});
const load = async (): Promise<void> => {
  const aberta = await skills.carregar(id);
  nome.value = aberta.nome;
  descricao.value = aberta.descricao;
  sqlModelo.value = aberta.sqlModelo;
  params.value = aberta.params.map((item) => ({ ...item }));
  original.value = snapshot();
  confirmado.value = false;
  validacaoPendente.value = false;
};
onMounted(() => {
  void run(load, { feedback: false });
});
const persist = async (bearer: string | undefined): Promise<void> => {
  if (!confirmado.value) {
    throw new Error("Confirme as alterações do rascunho antes de salvar.");
  }
  await api.post(
    `/app/api/skills/${encodeURIComponent(id)}`,
    {
      nome: nome.value,
      descricao: descricao.value,
      sqlModelo: sqlModelo.value,
      params: params.value,
      confirmadoPeloUsuario: confirmado.value,
    },
    bearer,
  );
  original.value = snapshot();
  confirmado.value = false;
};
const save = async (): Promise<void> => {
  await run(async (bearer) => {
    await persist(bearer);
    await load();
  });
};
const validar = async (): Promise<void> => {
  await run(async (bearer) => {
    if (dirty.value) {
      await persist(bearer);
    }
    validacaoPendente.value = true;
    await api.post(`/app/api/skills/${encodeURIComponent(id)}/validar`, {}, bearer);
    await load();
  });
};
const ampliar = async (): Promise<void> => {
  await run(async (bearer) => {
    if (!confirmaEscopo.value) {
      throw new Error("Confirme a ampliação do escopo.");
    }
    await api.post(
      `/app/api/skills/${encodeURIComponent(id)}/escopo`,
      {
        tabelas: tabelas.value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        confirmadoPeloUsuario: confirmaEscopo.value,
      },
      bearer,
    );
    confirmaEscopo.value = false;
    tabelas.value = "";
    // Refresh workflow without overwriting the editor's local draft.
    await skills.carregar(id);
  });
};
const destruir = async (operation: "remover" | "despublicar"): Promise<void> => {
  if (pending.value) {
    return;
  }
  const accepted = await askConfirmation({
    title: operation === "remover" ? "Remover skill?" : "Despublicar skill?",
    message:
      operation === "remover"
        ? `A skill “${nome.value}” será apagada e seus exemplos serão desvinculados. O grafo permanece.`
        : `A publicação de “${nome.value}” deixará de autorizar consultas. O rascunho permanece.`,
    action: operation === "remover" ? "Remover skill" : "Despublicar",
    danger: true,
  });
  if (!accepted) {
    return;
  }
  await run(async (bearer) => {
    await api.post(
      `/app/api/skills/${encodeURIComponent(id)}/${operation}`,
      { confirmadoPeloUsuario: accepted },
      bearer,
    );
    if (operation === "remover") {
      original.value = "";
      skills.limpar();
      await router.push({ name: "skills" });
    } else {
      await skills.carregar(id);
    }
  });
};
const seguir = async (): Promise<void> => {
  if (proximo.value === "validar_skill") {
    await validar();
  } else if (proximo.value === "publicar_skill") {
    await router.push({ name: "publicar", params: { id } });
  }
};
const lerPublicacao = async (): Promise<void> => {
  await run(async () => {
    await skills.carregar(id, "publicada");
  });
};
</script>
<template>
  <Page
    :title="nome || 'Skill'"
    lead="Edite o rascunho. As alterações só ampliam a autoridade após validar e publicar."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <template #actions><RouterLink to="/skills">Voltar às skills</RouterLink></template>
    <div v-if="fluxo" class="card">
      <div class="row">
        <StatusPill
          :label="
            skills.aberta?.publicacaoAtivaId || skills.aberta?.status === 'publicada'
              ? 'Publicação ativa'
              : 'Sem publicação ativa'
          "
          :tone="
            skills.aberta?.publicacaoAtivaId || skills.aberta?.status === 'publicada'
              ? 'ok'
              : 'neutral'
          "
        /><StatusPill
          :label="`Rascunho: ${statusLabel(skills.aberta?.statusRascunho || '')}`"
          tone="warn"
        />
      </div>
      <ol class="steps">
        <li v-for="passo in fluxo.passos" :key="passo.id">
          <strong>{{ passoLabel(passo.id) }}</strong
          ><span class="hint">{{ passo.status }} — {{ passo.hint }}</span>
        </li>
      </ol>
      <div class="form-actions">
        <button
          v-if="proximo === 'validar_skill' || proximo === 'publicar_skill'"
          type="button"
          @click="seguir"
        >
          {{
            proximo === "validar_skill" && dirty ? "Salvar e validar" : passoLabel(proximo)
          }}</button
        ><RouterLink v-else-if="linkProximo" class="btn" :to="linkProximo">{{
          passoLabel(proximo)
        }}</RouterLink
        ><button
          v-if="skills.aberta?.publicacaoAtivaId || skills.aberta?.status === 'publicada'"
          class="secondary"
          type="button"
          @click="lerPublicacao"
        >
          Ler publicação ativa
        </button>
      </div>
      <div v-if="skills.publicada?.id === id" class="callout">
        <h3>SQL da publicação ativa · somente leitura</h3>
        <pre class="code">{{ skills.publicada.sqlModelo }}</pre>
      </div>
    </div>
    <form class="card" @submit.prevent="save">
      <h2>Rascunho da skill</h2>
      <p v-if="dirty" class="callout warn" role="status">Há alterações não salvas.</p>
      <p v-if="validacaoPendente && error" class="callout warn" role="status">
        O rascunho salvo foi preservado. A validação continua pendente; revise o erro antes de
        validar novamente.
      </p>
      <label>Nome <input v-model="nome" required /></label
      ><label>Descrição <textarea v-model="descricao" rows="3" /></label>
      <SqlField v-model="sqlModelo" required /><ParamsEditor v-model="params" />
      <ConfirmField v-model="confirmado" label="Confirmo salvar estas alterações no rascunho" />
      <div class="form-actions">
        <button type="submit" :disabled="!dirty || !confirmado">Salvar rascunho</button
        ><button class="secondary" type="button" :disabled="dirty && !confirmado" @click="validar">
          {{ dirty ? "Salvar e validar" : "Validar rascunho" }}
        </button>
      </div>
    </form>
    <form class="card" @submit.prevent="ampliar">
      <h2>Ampliar escopo</h2>
      <p class="hint">
        Informe tabelas já treinadas. A confirmação altera o rascunho e não publica o pacote.
      </p>
      <label>Tabelas <input v-model="tabelas" required placeholder="pedido, cliente" /></label
      ><ConfirmField v-model="confirmaEscopo" label="Confirmo ampliar o escopo deste rascunho" />
      <div class="form-actions">
        <button type="submit" :disabled="!confirmaEscopo">Ampliar escopo</button>
      </div>
    </form>
    <div class="card danger-zone">
      <h2>Ações destrutivas</h2>
      <p class="hint">Revise o efeito antes de confirmar cada operação.</p>
      <div class="form-actions">
        <button
          v-if="skills.aberta?.publicacaoAtivaId || skills.aberta?.status === 'publicada'"
          class="secondary"
          type="button"
          @click="destruir('despublicar')"
        >
          Despublicar</button
        ><button class="danger" type="button" @click="destruir('remover')">Remover skill</button>
      </div>
    </div>
  </Page>
</template>
