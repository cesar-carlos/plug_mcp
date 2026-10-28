<script setup lang="ts">
import { computed } from "vue";
import { TOKEN_JSON_BYTES } from "../../../src/domain/persona-v2/admin-request-limits";
import { tokenRequestSize, type TokenIssuanceBody } from "./token-request-size";
const props = defineProps<{ body: TokenIssuanceBody }>();
const size = computed(() => tokenRequestSize(props.body));
const kib = (bytes: number) => (bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
</script>
<template>
  <section aria-label="Tamanho das permissões" :class="size.nearLimit ? 'notice' : 'field-help'">
    <p role="status">Tamanho do envio: {{ size.percent }}% do limite.</p>
    <progress
      :value="Math.min(size.bytes, TOKEN_JSON_BYTES)"
      :max="TOKEN_JSON_BYTES"
      aria-label="Uso do limite de envio"
    />
    <p>
      {{ kib(size.bytes) }} KiB de {{ kib(TOKEN_JSON_BYTES) }} KiB. Delegação:
      {{ kib(size.delegationBytes) }} KiB incluídos no total.
    </p>
    <p v-if="size.exceeded" role="alert">
      A seleção ultrapassa o limite. Revise as permissões antes de enviar; suas escolhas estão
      preservadas.
    </p>
    <p v-else-if="size.nearLimit">
      A seleção está próxima do limite. Confira o tamanho antes de adicionar mais acessos.
    </p>
    <details :open="size.exceeded">
      <summary>Como organizar os acessos em mais de um token</summary>
      <p>
        Separe por consumidor ou finalidade, como consultas financeiras e gestão de estoque. Escolha
        explicitamente as permissões de cada token e confira o resumo antes de emitir.
      </p>
      <p>
        Mantenha cada cruzamento junto de todas as consultas dependentes e bases necessárias no
        mesmo token. Preserve o conjunto completo de campos e finalidades de cada publicação.
      </p>
      <p>
        A delegação possui seu próprio teto e também ocupa espaço. Habilite-a somente quando o
        consumidor precisar delegar acessos. Nenhuma seleção será removida, dividida ou enviada
        automaticamente.
      </p>
    </details>
  </section>
</template>
