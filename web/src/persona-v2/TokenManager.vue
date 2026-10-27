<script setup lang="ts">
import ConfirmationDialog from "./ConfirmationDialog.vue";
import type { GrantPublication, Source } from "./model";
import TokenEditor from "./TokenEditor.vue";
import TokenManagerList from "./TokenManagerList.vue";
import { useTokenManager } from "./use-token-manager";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  confirmDiscard: () => Promise<boolean>;
  refresh: number;
  disabled: boolean;
  publications: Record<string, GrantPublication>;
  sources: Source[];
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  bearer: [value: string];
}>();
const {
  tokens,
  editing,
  edited,
  editor,
  busy,
  error,
  message,
  unconfirmed,
  listState,
  blocked,
  dirty,
  confirmation,
  answer,
  load,
  run,
  reloadEditing,
  edit,
  save,
  discardEditing,
  revoke,
} = useTokenManager(props, emit);
</script>
<template>
  <section aria-label="Gerenciar tokens" role="tabpanel" :aria-busy="busy" class="access-card">
    <ConfirmationDialog v-if="confirmation" v-bind="confirmation" @answer="answer" />
    <TokenManagerList
      :tokens="tokens"
      :edited="edited"
      :dirty="dirty"
      :blocked="blocked"
      :unconfirmed="unconfirmed"
      :error="error"
      :message="message"
      :list-state="listState"
      @refresh="run(load)"
      @edit="edit"
      @revoke="revoke"
      @reload="reloadEditing"
    />
    <TokenEditor
      v-if="edited && editing"
      ref="editor"
      v-model:edited="edited"
      :editing="editing"
      :tokens="tokens"
      :publications="publications"
      :sources="sources"
      :blocked="blocked"
      :unconfirmed="unconfirmed"
      :api="api"
      :base="base"
      @save="save"
      @reload="reloadEditing"
      @discard="discardEditing"
      @error="error = $event"
    />
  </section>
</template>
