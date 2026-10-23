<script setup lang="ts">
import { ref, nextTick } from "vue";
import type { Persona } from "./model";
const props = defineProps<{ persona: Persona; busy: boolean }>();
const emit = defineEmits<{ change: [active: boolean] }>();
const reviewing = ref(false),
  confirmed = ref(false);
const heading = ref<HTMLElement>(),
  opener = ref<HTMLButtonElement>();
async function review() {
  reviewing.value = true;
  confirmed.value = false;
  await nextTick();
  heading.value?.focus();
}
async function cancel() {
  reviewing.value = false;
  confirmed.value = false;
  await nextTick();
  opener.value?.focus();
}
</script>

<template>
  <section aria-label="Estado da persona">
    <p>
      <strong>{{ persona.active ? "Persona ativa" : "Persona suspensa" }}</strong>
    </p>
    <button v-if="!reviewing" ref="opener" :disabled="busy" @click="review">
      {{ persona.active ? "Suspender persona" : "Recuperar persona" }}
    </button>
    <form
      v-else
      aria-label="Confirmar estado da persona"
      @submit.prevent="emit('change', !props.persona.active)"
    >
      <h3 ref="heading" tabindex="-1">
        {{ persona.active ? "Revisar suspensão" : "Revisar recuperação" }}
      </h3>
      <p v-if="persona.active">
        O uso desta persona será bloqueado. Todas as publicações serão suspensas e conexões OAuth
        derivadas serão revogadas. Fontes, rascunhos e snapshots serão preservados. Efeitos já
        enviados às bases não são desfeitos.
      </p>
      <p v-else>
        A persona voltará a aceitar administração. Publicações continuarão suspensas até revisão e
        republicação; tokens e conexões revogados não serão recuperados. Fontes suspensas também
        continuarão suspensas.
      </p>
      <label
        ><input v-model="confirmed" type="checkbox" :disabled="busy" required />Revisei os efeitos
        desta alteração</label
      >
      <button :disabled="busy || !confirmed">
        Confirmar {{ persona.active ? "suspensão" : "recuperação" }}
      </button>
      <button type="button" :disabled="busy" @click="cancel">Continuar sem alterar</button>
    </form>
  </section>
</template>
