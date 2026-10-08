<script lang="ts">
export default { name: "EscopoView" };
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const { pending, error, run, success } = useAction();
const empresa = ref("");
const filial = ref("");
const timezone = ref("");
const bindings = ref<{ tabela: string; coluna: string; param: "empresa" | "filial" }[]>([]);
const confirmado = ref(false);
const vigente = ref("");
const carregado = ref(false);
const original = ref("");
const snapshot = (): string =>
  JSON.stringify({
    empresa: empresa.value,
    filial: filial.value,
    timezone: timezone.value,
    bindings: bindings.value,
  });
useUnsavedChanges(computed(() => original.value !== "" && snapshot() !== original.value));

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
    original.value = snapshot();
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
        bindings: bindings.value,
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    const acesso = await session.refreshAcesso();
    vigente.value = [
      acesso.escopoPadrao?.empresa ? `empresa ${acesso.escopoPadrao.empresa}` : "",
      acesso.escopoPadrao?.filial ? `filial ${acesso.escopoPadrao.filial}` : "",
      acesso.timezone ?? "",
      `${acesso.escopoPadrao?.bindings?.length ?? 0} vínculo(s)`,
    ]
      .filter(Boolean)
      .join(" · ");
    original.value = snapshot();
    confirmado.value = false;
  });
};
</script>

<template>
  <Page
    title="Escopo padrão"
    lead="Empresa e filial entram como recorte imutável nas consultas."
    :error="error"
    :pending="pending"
    :success="success"
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
        <label>Fuso horário <input v-model="timezone" placeholder="America/Cuiaba" /></label>
      </fieldset>
      <fieldset class="section">
        <legend>Vínculo físico</legend>
        <p class="hint">
          Empresa e filial precisam apontar para a coluna da tabela. O valor no parâmetro, sozinho,
          não recorta a consulta.
        </p>
        <div v-for="(item, index) in bindings" :key="index" class="bind-row">
          <label>Tabela <input v-model="item.tabela" required /></label>
          <label>Coluna <input v-model="item.coluna" required /></label>
          <label>
            Parâmetro
            <select v-model="item.param">
              <option value="empresa">empresa</option>
              <option value="filial">filial</option>
            </select>
          </label>
          <button class="secondary" type="button" @click="bindings.splice(index, 1)">
            Remover vínculo {{ index + 1 }}
          </button>
        </div>
        <button class="secondary" type="button" @click="addBinding">Adicionar vínculo</button>
      </fieldset>
      <ConfirmField v-model="confirmado" label="Confirmo gravar este recorte imutável" />
      <div class="form-actions">
        <button type="submit" :disabled="pending || !confirmado">Salvar</button>
      </div>
    </form>
  </Page>
</template>
