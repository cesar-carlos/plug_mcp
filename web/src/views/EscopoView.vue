<script lang="ts">
export default { name: "EscopoView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";

const { pending, error, run } = useAction();
const empresa = ref("");
const filial = ref("");
const timezone = ref("");
const bindings = ref<{ tabela: string; coluna: string; param: "empresa" | "filial" }[]>([]);
const confirmado = ref(false);

const addBinding = (): void => {
  bindings.value.push({ tabela: "", coluna: "", param: "empresa" });
};

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/acesso/escopo",
      {
        empresa: empresa.value || undefined,
        filial: filial.value || undefined,
        timezone: timezone.value || undefined,
        bindings: bindings.value.filter((item) => item.tabela && item.coluna),
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
  });
};
</script>

<template>
  <Page
    title="Escopo padrão"
    lead="Empresa e filial entram como recorte imutável nas consultas."
    :error="error"
  >
    <form class="card" @submit.prevent="save">
      <label>Empresa <input v-model="empresa" /></label>
      <label>Filial <input v-model="filial" /></label>
      <label>Timezone <input v-model="timezone" placeholder="America/Cuiaba" /></label>
      <h2>Vínculo físico</h2>
      <p>
        Empresa e filial precisam apontar para a coluna da tabela. A presença do valor no parâmetro
        não basta.
      </p>
      <div v-for="(item, index) in bindings" :key="index" class="card">
        <label>Tabela <input v-model="item.tabela" /></label>
        <label>Coluna <input v-model="item.coluna" /></label>
        <label>
          Parâmetro
          <select v-model="item.param">
            <option value="empresa">empresa</option>
            <option value="filial">filial</option>
          </select>
        </label>
      </div>
      <button class="secondary" type="button" @click="addBinding">Adicionar vínculo</button>
      <ConfirmField v-model="confirmado" />
      <button type="submit" :disabled="pending">Gravar</button>
    </form>
  </Page>
</template>
