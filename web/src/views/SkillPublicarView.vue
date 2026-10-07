<script lang="ts">
export default { name: "SkillPublicarView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSkillStore } from "../stores/skills";
import Page from "../components/Page.vue";
import JsonBlock from "../components/JsonBlock.vue";
import ConfirmField from "../components/ConfirmField.vue";

const route = useRoute();
const router = useRouter();
const skills = useSkillStore();
const { pending, error, run } = useAction();
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

const confirm = async (): Promise<void> => {
  await run(async (bearer) => {
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
  });
};
</script>

<template>
  <Page
    title="Publicar skill"
    lead="A primeira chamada só mostra o diff. A segunda usa o hash vigente guardado nesta aba."
    :error="error"
  >
    <JsonBlock v-if="preview" :value="preview" />
    <form class="card" @submit.prevent="confirm">
      <ConfirmField v-model="confirmado" label="Confirmo publicar este pacote" />
      <button type="submit" :disabled="pending || !skills.confirmacaoHash">
        Confirmar publicação
      </button>
    </form>
  </Page>
</template>
