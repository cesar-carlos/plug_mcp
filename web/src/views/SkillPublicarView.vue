<script lang="ts">
export default { name: "SkillPublicarView" };
</script>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, ConsoleApiError } from "../api";
import { useAction } from "../composables/useAction";
import { useSkillStore } from "../stores/skills";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";
import ConfirmField from "../components/ConfirmField.vue";

const route = useRoute();
const router = useRouter();
const skills = useSkillStore();
const { pending, error, success, run } = useAction();
const preview = ref<unknown>(null);
const confirmado = ref(false);

const id = (): string => String(route.params.id);

const applyPreview = (payload: unknown): void => {
  preview.value = payload;
  const hash =
    payload && typeof payload === "object" && "confirmacaoHash" in payload
      ? payload.confirmacaoHash
      : null;
  skills.guardarHash(typeof hash === "string" ? hash : null);
};

const loadPreview = async (bearer: string | undefined): Promise<void> => {
  confirmado.value = false;
  skills.guardarHash(null);
  applyPreview(await api.post(`/app/api/skills/${encodeURIComponent(id())}/publicar`, {}, bearer));
};

onMounted(() => {
  void run(async (bearer) => {
    if (skills.aberta?.id !== id()) {
      await skills.carregar(id());
    }
    if (!skills.podePublicar) {
      await router.replace({ name: "skill", params: { id: id() } });
      return;
    }
    await loadPreview(bearer);
  });
});

onBeforeUnmount(() => skills.guardarHash(null));

const confirm = async (): Promise<void> => {
  if (!confirmado.value || !skills.confirmacaoHash) {
    return;
  }
  await run(async (bearer) => {
    try {
      applyPreview(
        await api.post(
          `/app/api/skills/${encodeURIComponent(id())}/publicar`,
          {
            confirmadoPeloUsuario: confirmado.value,
            confirmacaoHash: skills.confirmacaoHash,
          },
          bearer,
        ),
      );
      await skills.carregar(id());
      confirmado.value = false;
    } catch (caught) {
      if (caught instanceof ConsoleApiError && caught.code === "CONFIRMACAO_DESATUALIZADA") {
        skills.guardarHash(null);
        preview.value = null;
        confirmado.value = false;
      }
      throw caught;
    }
  });
};
</script>

<template>
  <Page
    title="Publicar skill"
    lead="Revise as mudanças do rascunho e confirme a publicação deste pacote."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <div v-if="preview" class="card">
      <h2>Revisão da publicação</h2>
      <DataView :value="preview" />
    </div>
    <form class="card" @submit.prevent="confirm">
      <ConfirmField v-model="confirmado" label="Confirmo publicar este pacote" />
      <div class="form-actions">
        <button type="submit" :disabled="pending || !skills.confirmacaoHash || !confirmado">
          Confirmar publicação
        </button>
        <button class="secondary" type="button" @click="run(loadPreview)">
          Gerar nova revisão
        </button>
      </div>
    </form>
  </Page>
</template>
