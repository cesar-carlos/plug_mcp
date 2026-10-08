<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useUnsavedChanges } from "../composables/useUnsavedChanges";
import type { GrafoJoinBody } from "../form-payloads";
import { askConfirmation } from "../confirmation";
import ConfirmField from "./ConfirmField.vue";
const props = defineProps<{ skillId?: string; pending?: boolean; revision?: number }>();
const origem = ref("");
const destino = ref("");
const pares = ref([{ colunaOrigem: "", colunaDestino: "" }]);
const cardinalidade = ref("");
const tipoJoin = ref("");
const confirmado = ref(false);
const snapshot = (): string =>
  JSON.stringify([origem.value, destino.value, pares.value, cardinalidade.value, tipoJoin.value]);
const original = ref(snapshot());
useUnsavedChanges(computed(() => snapshot() !== original.value));
watch(
  () => props.revision,
  () => {
    original.value = snapshot();
  },
);
watch(
  () => props.skillId,
  () => {
    confirmado.value = false;
  },
);
const emit = defineEmits<{ confirmar: [body: GrafoJoinBody]; remover: [body: GrafoJoinBody] }>();
const body = (): GrafoJoinBody => ({
  skillId: props.skillId || undefined,
  tabelaOrigem: origem.value,
  tabelaDestino: destino.value,
  colunaOrigem: pares.value[0]?.colunaOrigem ?? "",
  colunaDestino: pares.value[0]?.colunaDestino ?? "",
  pares: pares.value.map((item) => ({ ...item })),
  cardinalidade: cardinalidade.value,
  ...(tipoJoin.value && tipoJoin.value !== "preservar" ? { tipoJoin: tipoJoin.value } : {}),
});
const confirmar = (): void => {
  if (confirmado.value && cardinalidade.value && tipoJoin.value) {
    emit("confirmar", body());
    confirmado.value = false;
  }
};
const remover = async (): Promise<void> => {
  const accepted = await askConfirmation({
    title: "Remover relacionamento?",
    message: `Remover o JOIN entre “${origem.value}” e “${destino.value}” com os pares apresentados? Publicações incompatíveis podem ser suspensas.`,
    action: "Remover JOIN",
    danger: true,
  });
  if (accepted) {
    emit("remover", { ...body(), confirmadoPeloUsuario: accepted });
  }
};
</script>
<template>
  <form class="card" @submit.prevent="confirmar">
    <h2>Relacionamento</h2>
    <div class="fields-2">
      <label>Tabela origem<input v-model="origem" required /></label
      ><label>Tabela destino<input v-model="destino" required /></label>
    </div>
    <fieldset class="section">
      <legend>Pares do JOIN</legend>
      <div v-for="(par, index) in pares" :key="index" class="bind-row">
        <label>Coluna origem<input v-model="par.colunaOrigem" required /></label
        ><label>Coluna destino<input v-model="par.colunaDestino" required /></label
        ><button
          class="secondary"
          type="button"
          :disabled="pares.length === 1"
          @click="pares.splice(index, 1)"
        >
          Remover par {{ index + 1 }}
        </button>
      </div>
      <button
        class="secondary"
        type="button"
        @click="pares.push({ colunaOrigem: '', colunaDestino: '' })"
      >
        Adicionar par
      </button>
    </fieldset>
    <div class="fields-2">
      <label
        >Cardinalidade<select v-model="cardinalidade" required>
          <option value="">Selecione explicitamente</option>
          <option v-for="tipo in ['1:1', '1:N', 'N:1', 'N:N']" :key="tipo">{{ tipo }}</option>
        </select></label
      ><label
        >Tipo de JOIN<select v-model="tipoJoin" required aria-describedby="join-type-hint">
          <option value="">Selecione explicitamente</option>
          <option value="preservar">Preservar tipo existente</option>
          <option value="inner">INNER</option>
          <option value="left">LEFT</option>
        </select></label
      >
    </div>
    <p id="join-type-hint" class="hint">
      Preserve o tipo quando o JOIN já estiver no SQL ou no grafo. Para uma relação nova, escolha
      INNER ou LEFT.
    </p>
    <ConfirmField
      v-model="confirmado"
      label="Confirmo os pares, a cardinalidade e o tipo deste relacionamento"
    />
    <div class="form-actions">
      <button type="submit" :disabled="pending || !confirmado || !cardinalidade || !tipoJoin">
        Confirmar JOIN</button
      ><button
        class="danger"
        type="button"
        :disabled="
          pending ||
          !origem ||
          !destino ||
          pares.some((par) => !par.colunaOrigem || !par.colunaDestino)
        "
        @click="remover"
      >
        Remover JOIN
      </button>
    </div>
  </form>
</template>
