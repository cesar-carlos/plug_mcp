import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { ConsoleRequestError } from "./model";
import {
  cloneManagedToken,
  isManagedTokenDirty,
  tokenMutationBody,
  tokenMutationMessage,
  tokenMutationPath,
  tokenRevokePrompt,
  tokenRotatePrompt,
  type TokenListState,
} from "./token-manager";
import type { ManagedToken } from "./token-permissions";
import { useConfirmation, type Confirmation } from "./useConfirmation";

export interface TokenManagerProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  confirmDiscard: () => Promise<boolean>;
  refresh: number;
  disabled: boolean;
}

export interface TokenManagerEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "bearer", value: string): void;
}

export interface TokenManagerState {
  tokens: Ref<ManagedToken[]>;
  editing: Ref<ManagedToken | undefined>;
  edited: Ref<ManagedToken | undefined>;
  editor: Ref<{ focus: () => void } | undefined>;
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  unconfirmed: Ref<boolean>;
  listState: Ref<TokenListState>;
  blocked: ComputedRef<boolean>;
  dirty: ComputedRef<boolean>;
  confirmation: Ref<Confirmation | undefined>;
  answer: (value: boolean) => void;
  load: () => Promise<void>;
  run: (action: () => Promise<void>, mutation?: boolean) => Promise<void>;
  reloadEditing: () => Promise<void>;
  edit: (token: ManagedToken) => Promise<void>;
  save: (rotate?: boolean) => Promise<void>;
  discardEditing: () => void;
  revoke: (token: ManagedToken) => Promise<void>;
}

export function useTokenManager(
  props: TokenManagerProps,
  emit: TokenManagerEmit,
): TokenManagerState {
  const tokens = ref<ManagedToken[]>([]);
  const editing = ref<ManagedToken>();
  const edited = ref<ManagedToken>();
  const editor = ref<{ focus: () => void }>();
  const busy = ref(false);
  const error = ref("");
  const message = ref("");
  const unconfirmed = ref(false);
  const listState = ref<TokenListState>("idle");
  const blocked = computed(() => busy.value || props.disabled);
  const dirty = computed(() => isManagedTokenDirty(edited.value, editing.value));
  const { confirmation, ask, answer } = useConfirmation();
  watch(dirty, (value) => emit("dirty", value));
  let live = true;
  let loadedRefresh = -1;

  onBeforeUnmount(() => {
    live = false;
    emit("dirty", false);
  });

  async function load(): Promise<void> {
    loadedRefresh = props.refresh;
    listState.value = "loading";
    try {
      const response = await props.api<{ tokens: ManagedToken[] }>(`${props.base}/tokens`);
      if (live) {
        tokens.value = response.tokens;
        loadedRefresh = props.refresh;
        listState.value = "loaded";
      }
    } catch (cause) {
      if (live) {
        listState.value = "error";
      }
      throw cause;
    }
  }

  async function run(action: () => Promise<void>, mutation = false): Promise<void> {
    if (blocked.value) {
      return;
    }
    if (mutation && unconfirmed.value) {
      return;
    }
    busy.value = true;
    emit("lock", true);
    error.value = "";
    message.value = "";
    try {
      await action();
    } catch (cause) {
      if (
        live &&
        mutation &&
        cause instanceof ConsoleRequestError &&
        cause.code === "RESPONSE_UNCONFIRMED"
      ) {
        unconfirmed.value = true;
        emit("bearer", "");
      }
      if (live) {
        error.value = cause instanceof Error ? cause.message : "Não foi possível concluir.";
      }
    } finally {
      busy.value = false;
      emit("lock", false);
    }
  }

  onMounted(() => {
    void run(load);
  });
  watch(
    () => [props.refresh, props.disabled],
    () => {
      if (!props.disabled && loadedRefresh !== props.refresh) {
        void run(load);
      }
    },
  );

  async function reloadEditing(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    const id = editing.value?.id;
    await run(async () => {
      await load();
      const latest = tokens.value.find((item) => item.id === id);
      editing.value = latest;
      edited.value = latest ? cloneManagedToken(latest) : undefined;
      unconfirmed.value = false;
    });
  }

  async function edit(token: ManagedToken): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    editing.value = token;
    edited.value = cloneManagedToken(token);
    await nextTick();
    editor.value?.focus();
  }

  async function save(rotate = false): Promise<void> {
    const token = edited.value;
    const current = editing.value;
    if (!token || !current || unconfirmed.value) {
      return;
    }
    if (rotate && !(await ask(tokenRotatePrompt()))) {
      return;
    }
    await run(async () => {
      const response = await props.api<{ bearer?: string }>(
        tokenMutationPath(props.base, token.id, rotate),
        tokenMutationBody(token, current.authorizationVersion),
      );
      if (response.bearer) {
        emit("bearer", response.bearer);
      }
      editing.value = undefined;
      edited.value = undefined;
      await load();
      message.value = tokenMutationMessage(rotate);
    }, true);
  }

  function discardEditing(): void {
    edited.value = undefined;
    editing.value = undefined;
  }

  async function revoke(token: ManagedToken): Promise<void> {
    if (unconfirmed.value) {
      return;
    }
    if (blocked.value) {
      return;
    }
    if (!(await ask(tokenRevokePrompt(token)))) {
      return;
    }
    await run(async () => {
      await props.api(`${props.base}/tokens/${token.id}/revogar`, {});
      emit("bearer", "");
      if (editing.value?.id === token.id) {
        editing.value = undefined;
        edited.value = undefined;
      }
      await load();
      message.value = "Token revogado.";
    }, true);
  }

  return {
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
  };
}
