<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  personaId: string;
  item: { skillId: string; publicationId: string; itemId: string; label: string };
  call: <T>(tool: string, args: unknown) => Promise<T>;
  disabled: boolean;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean] }>();
const type = ref("erro"),
  content = ref(""),
  busy = ref(false),
  message = ref("");
const { error, errorSummary } = useErrorSummary();
let live = true;
const dirty = computed(() => !!content.value);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
onBeforeUnmount(() => {
  live = false;
  emit("dirty", false);
});
async function send() {
  if (busy.value || props.disabled) {
    return;
  }
  busy.value = true;
  emit("lock", true);
  error.value = "";
  try {
    const context = await props.call<{ id: string }>("obter_contexto_persona", {});
    if (!live) {
      return;
    }
    if (context.id !== props.personaId) {
      throw new Error("Este token pertence a outra persona.");
    }
    await props.call("registrar_feedback_conhecimento", {
      skillId: props.item.skillId,
      publicationId: props.item.publicationId,
      itemId: props.item.itemId,
      type: type.value,
      content: content.value,
    });
    if (live) {
      content.value = "";
      message.value = "Feedback registrado para revisão. O treinamento não foi alterado.";
    }
  } catch (e) {
    if (live) {
      error.value = e instanceof Error ? e.message : "Feedback indisponível.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
</script>
<template>
  <form aria-label="Registrar feedback de conhecimento" @submit.prevent="send">
    <h4>Feedback: {{ item.label }}</h4>
    <p>
      Descreva erro, correção ou lacuna usando conteúdo sintético. Não envie perguntas, resultados,
      parâmetros de execução ou segredos.
    </p>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="disabled || busy">
      <label
        >Tipo de feedback<select v-model="type">
          <option value="erro">Erro</option>
          <option value="correcao">Correção</option>
          <option value="lacuna">Lacuna</option>
        </select></label
      ><label>Descrição do feedback<textarea v-model="content" maxlength="4000" required /></label
      ><button>Enviar feedback para revisão</button>
    </fieldset>
  </form>
</template>
