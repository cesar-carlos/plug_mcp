<script lang="ts">
export default { name: "EscopoView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const { pending, error, run } = useAction();
const empresa = ref("");
const filial = ref("");
const timezone = ref("");
const bindings = ref<{ tabela: string; coluna: string; param: "empresa" | "filial" }[]>([]);
const confirmado = ref(false);
const vigente = ref("");
const carregado = ref(false);

onMounted(() => {
  void run(async () => {
    const acesso = await session.refreshAcesso();
    const escopo = acesso.escopoPadrao;
    empresa.value = escopo?.empresa ?? "";
    filial.value = escopo?.filial ?? "";
    timezone.value = acesso.timezone ?? "";
    bindings.value = (escopo?.bindings ?? []).map((item) => ({
      tabela: item.tabela,
      coluna: item.coluna,
      param: item.param,
    }));
    vigente.value = [
      empresa.value ? `empresa ${empresa.value}` : "",
      filial.value ? `filial ${filial.value}` : "",
      timezone.value,
      bindings.value.length > 0 ? `${bindings.value.length} vínculo(s)` : "",
    ]
      .filter((item) => item.length > 0)
      .join(" · ");
  }).then(() => {
    carregado.value = true;
  });
});

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
      <p v-if="vigente" class="callout">
        Recorte vigente: {{ vigente }}. Gravar substitui estes valores.
      </p>
      <p v-else-if="carregado && !error" class="callout">Nenhum recorte gravado neste acesso.</p>
      <fieldset class="section">
        <legend>Recorte</legend>
        <div class="fields-2">
          <label>Empresa <input v-model="empresa" /></label>
          <label>Filial <input v-model="filial" /></label>
        </div>
        <label>Timezone <input v-model="timezone" placeholder="America/Cuiaba" /></label>
      </fieldset>
      <fieldset class="section">
        <legend>Vínculo físico</legend>
        <p class="hint">
          Empresa e filial precisam apontar para a coluna da tabela. O valor no parâmetro, sozinho,
          não recorta a consulta.
        </p>
        <div v-for="(item, index) in bindings" :key="index" class="bind-row">
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
      </fieldset>
      <ConfirmField v-model="confirmado" label="Confirmo gravar este recorte imutável" />
      <div class="form-actions">
        <button type="submit" :disabled="pending">Gravar</button>
      </div>
    </form>
  </Page>
</template>
