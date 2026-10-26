<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { mascots, mascotLicense } from "./mascots/catalog";
import { useErrorSummary } from "./useErrorSummary";

const props = defineProps<{
  disabled?: boolean;
  allowSelection?: boolean;
  selectedId?: string | null;
  selectionPending?: boolean;
}>();
const emit = defineEmits<{ choose: [file: File, id: string]; loading: [value: boolean] }>();
const playing = ref<string | null>(null);
const selecting = ref(false);
const { error, errorSummary } = useErrorSummary();
const abort = new AbortController();
onBeforeUnmount(() => abort.abort());

async function choose(mascot: (typeof mascots)[number]) {
  if (props.disabled || selecting.value || !props.allowSelection) return;
  selecting.value = true;
  emit("loading", true);
  error.value = "";
  try {
    // Only bundled, immutable portrait URLs; no arbitrary URL or remote credential.
    const response = await fetch(mascot.portrait, { signal: abort.signal, credentials: "omit" });
    if (!response.ok) throw new Error("portrait unavailable");
    const blob = await response.blob();
    if (!blob.size || blob.size > 512 * 1024 || blob.type !== "image/png")
      throw new Error("invalid portrait");
    if (!abort.signal.aborted)
      emit("choose", new File([blob], `${mascot.id}.png`, { type: "image/png" }), mascot.id);
  } catch {
    if (!abort.signal.aborted)
      error.value = "Não foi possível carregar o retrato. Sua escolha anterior foi preservada.";
  } finally {
    selecting.value = false;
    emit("loading", false);
  }
}
</script>

<template>
  <section aria-label="Mascotes para ChatGPT" :aria-busy="selecting">
    <h4>Mascotes da comunidade</h4>
    <p>
      Prévia animada e pacote para clientes compatíveis com Pets v2. São mascotes comunitários, não
      Dots oficiais da OpenAI.
    </p>
    <p v-if="allowSelection">
      “Usar retrato” prepara uma imagem estática. Confirme em “Salvar ícone” para aplicá-la à
      persona.
    </p>
    <h5 v-if="allowSelection">Aparência da persona</h5>
    <p v-if="allowSelection" class="field-help">
      O retrato será salvo apenas neste servidor. A seleção não altera o ChatGPT.
    </p>
    <div class="mascot-grid">
      <article
        v-for="mascot in mascots"
        :key="mascot.id"
        :aria-label="mascot.name"
        class="mascot-card"
        :class="{ selected: selectedId === mascot.id }"
      >
        <div
          v-if="playing === mascot.id"
          role="img"
          :aria-label="`Prévia animada de ${mascot.name}`"
          class="mascot-animation"
          :style="{ backgroundImage: `url(${mascot.atlas})` }"
        />
        <img
          v-else
          :src="mascot.portrait"
          :alt="mascot.name"
          width="96"
          height="104"
          loading="lazy"
        />
        <h5>{{ mascot.name }}</h5>
        <p>{{ mascot.description }}</p>
        <button
          type="button"
          class="secondary"
          :aria-pressed="playing === mascot.id"
          @click="playing = playing === mascot.id ? null : mascot.id"
        >
          {{ playing === mascot.id ? "Pausar prévia" : "Ver animação" }}
        </button>
        <button
          v-if="allowSelection"
          type="button"
          :disabled="disabled || selecting"
          :aria-pressed="selectedId === mascot.id"
          @click="choose(mascot)"
        >
          Usar retrato de {{ mascot.name }}
        </button>
        <p v-if="selectedId === mascot.id" class="selection-label">
          {{ selectionPending ? "Selecionado para salvar" : "Retrato salvo nesta sessão" }}
        </p>
        <p>
          <a :href="mascot.portrait" :download="`${mascot.id}.png`"
            >Baixar retrato de {{ mascot.name }} (PNG)</a
          >
        </p>
      </article>
    </div>
    <p v-if="selecting" role="status">Carregando retrato…</p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <details>
      <summary>Usar no ChatGPT ou Codex</summary>
      <p>
        Etapa separada: baixar estes arquivos não instala um mascote. A instalação e a escolha de
        aparência acontecem no cliente.
      </p>
      <ul>
        <li v-for="mascot in mascots" :key="mascot.id">
          <a :href="mascot.package" :download="`${mascot.id}-pet-v2.zip`"
            >Baixar {{ mascot.name }} (ZIP v2)</a
          >
        </li>
      </ul>
      <p>
        O ZIP contém pet.json, spritesheet.webp, retrato, instruções e licença. A instalação é
        manual nas configurações de Pets do cliente compatível; não instala plugins nem altera sua
        conexão MCP.
      </p>
      <p>
        Formato incluído: v2, 1536 × 2288. Confira a versão aceita pelo seu aplicativo: clientes que
        exigem 1536 × 1872 não aceitam este pacote. Não há instalação automática nem compatibilidade
        garantida com todas as versões.
      </p>
      <p>
        A aparência de um Dot é configurada no próprio ChatGPT. Salvar o ícone aqui não modifica o
        avatar do Dot.
      </p>
      <p>
        <a href="https://learn.chatgpt.com/docs/pets" target="_blank" rel="noopener noreferrer"
          >Guia oficial de Pets</a
        >
        ·
        <a
          href="https://learn.chatgpt.com/docs/dots/getting-started"
          target="_blank"
          rel="noopener noreferrer"
          >Configurar um Dot</a
        >
      </p>
    </details>
    <p class="field-help">
      Arte: Alexey Yakovlev / aprocom ·
      <a :href="mascotLicense" download="mascots-LICENSE.txt">Licença MIT</a> ·
      <a
        href="https://github.com/aprocom/chatgpt-pets/tree/a6fbf8e516da23811fdd3371a212f565d250952c"
        target="_blank"
        rel="noopener noreferrer"
        >Origem dos arquivos</a
      >. A animação é demonstrativa e não indica execução de tarefas.
    </p>
  </section>
</template>

<style scoped>
.mascot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 16px;
}
.mascot-card {
  border: 1px solid #c7d5cc;
  border-radius: 12px;
  padding: 16px;
  min-width: 0;
}
.mascot-card h5 {
  font-size: 1rem;
  margin: 12px 0;
}
.mascot-card.selected {
  border: 2px solid #126348;
  padding: 15px;
}
.selection-label {
  font-weight: 600;
  color: #174f32;
  background: #e8f0eb;
  padding: 8px;
  border-radius: 6px;
}
.mascot-card a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
.mascot-card img {
  object-fit: contain;
}
.mascot-card a {
  overflow-wrap: anywhere;
}
.mascot-animation {
  width: 96px;
  height: 104px;
  background-size: 768px 1144px;
  background-repeat: no-repeat;
  animation: mascot-idle 1.4s steps(7) infinite;
}
@keyframes mascot-idle {
  to {
    background-position-x: -672px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mascot-animation {
    animation: none;
  }
}
</style>
