<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ListSearch from "./ListSearch.vue";
import {
  matchesTokenList,
  TOKEN_LIST_CLOCK_MS,
  TOKEN_LIST_DEFAULT_FILTER,
  tokenExpiryHelp,
  tokenListHidesRevoked,
  tokenListStatus,
  type TokenListState,
} from "./token-manager";
import type { ManagedToken } from "./token-permissions";
import { tokenValidity } from "./token-validity";

const props = defineProps<{
  tokens: ManagedToken[];
  edited?: ManagedToken;
  dirty: boolean;
  blocked: boolean;
  unconfirmed: boolean;
  error: string;
  message: string;
  listState: TokenListState;
}>();
const emit = defineEmits<{
  refresh: [];
  edit: [token: ManagedToken];
  revoke: [token: ManagedToken];
  reload: [];
}>();

const search = ref("");
const stateFilter = ref(TOKEN_LIST_DEFAULT_FILTER);
const now = ref(Date.now());
let clock: number | undefined;

function updateClock(): void {
  now.value = Date.now();
}

onMounted(() => {
  clock = window.setInterval(updateClock, TOKEN_LIST_CLOCK_MS);
  window.addEventListener("focus", updateClock);
});
onBeforeUnmount(() => {
  window.clearInterval(clock);
  window.removeEventListener("focus", updateClock);
});

const matchingTokens = computed(() =>
  props.tokens.filter((token) =>
    matchesTokenList(token, search.value, stateFilter.value, now.value),
  ),
);

function clearFilters(): void {
  search.value = "";
  stateFilter.value = "todos";
}
</script>
<template>
  <div class="access-card-heading">
    <div>
      <h3>Tokens cadastrados</h3>
      <p class="field-help">Revise quem pode acessar esta persona e quais permissões recebeu.</p>
    </div>
    <button class="secondary" :disabled="blocked" @click="emit('refresh')">
      Atualizar lista de tokens
    </button>
  </div>
  <div class="access-filters">
    <template v-if="tokens.length">
      <ListSearch
        v-model="search"
        label="Buscar tokens"
        :matches="matchingTokens.length"
        :total="tokens.length"
      />
      <label
        >Situação dos tokens<select v-model="stateFilter">
          <option value="nao_revogados">Não revogados (padrão, pode incluir expirados)</option>
          <option value="ativo">Ativos (mais de 7 dias ou sem expiração)</option>
          <option value="vence_em_breve">Vencem em até 7 dias</option>
          <option value="expirado">Expirados</option>
          <option value="revogados">Revogados</option>
          <option value="todos">Todos</option>
        </select></label
      >
    </template>
  </div>
  <p v-if="tokenListHidesRevoked(stateFilter, tokens)" class="field-help">
    Tokens revogados ficam ocultos. Escolha “Revogados” ou “Todos” acima para revê-los.
  </p>
  <div v-if="tokens.length && !matchingTokens.length" class="notice" role="status">
    <p>Nenhum token corresponde aos filtros. Escolha “Todos” ou limpe a busca.</p>
    <button type="button" class="secondary" @click="clearFilters">Limpar filtros</button>
  </div>
  <p v-if="error" role="alert" class="error">{{ error }}</p>
  <p v-if="message" role="status" class="success">{{ message }}</p>
  <div v-if="unconfirmed" role="status" class="notice">
    <p>
      Alteração sem confirmação. Confira o cadastro antes de fazer outra alteração. Uma rotação
      concluída não permite recuperar o segredo perdido.
    </p>
    <button class="secondary" :disabled="blocked" @click="emit('reload')">
      Conferir estado dos tokens
    </button>
  </div>
  <p v-if="listState === 'loading'" role="status">Carregando tokens…</p>
  <p v-else-if="listState === 'error'" class="notice">
    Não foi possível atualizar a lista. Use Atualizar lista de tokens para tentar novamente.
    <span v-if="tokens.length">Os registros exibidos são da última leitura confirmada.</span>
  </p>
  <p v-else-if="listState === 'loaded' && !tokens.length">
    Nenhum token emitido para esta persona. Use o formulário “Emitir token” para escolher as
    permissões do primeiro consumidor.
  </p>
  <ul class="token-list access-records">
    <li
      v-for="token in matchingTokens"
      :key="token.id"
      :class="{ 'access-record-editing': edited?.id === token.id }"
    >
      <div class="access-record-heading">
        <strong>{{ token.name }}</strong>
        <span
          class="access-status"
          :class="{
            'access-status-muted': ['revogado', 'desconhecido'].includes(tokenValidity(token, now)),
            'access-status-warning': tokenValidity(token, now) === 'vence_em_breve',
            'access-status-expired': tokenValidity(token, now) === 'expirado',
          }"
          >{{ tokenListStatus(token, now) }}</span
        >
      </div>
      <p class="field-help">
        {{ tokenExpiryHelp(token.expiresAt) }} · {{ token.permissions.skills.length }} skills
        concedidas
      </p>
      <p v-if="edited?.id === token.id" class="field-help">
        Em edição{{ dirty ? " · alterações não salvas" : "" }}
      </p>
      <div class="access-actions">
        <button
          class="secondary"
          :disabled="blocked || !!token.revokedAt"
          @click="emit('edit', token)"
        >
          Editar {{ token.name }}
        </button>
        <button
          class="danger"
          :disabled="blocked || unconfirmed || !!token.revokedAt"
          @click="emit('revoke', token)"
        >
          Revogar {{ token.name }}
        </button>
      </div>
    </li>
  </ul>
</template>
