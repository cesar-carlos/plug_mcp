<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import type { GrantPublication, Source } from "./model";
import { ConsoleRequestError } from "./model";
import { administrativeOptions } from "./administrative-options";
import { fieldCapabilityLabel } from "./field-capabilities";
import {
  publicationGrant,
  publicationEffectsLabel,
  publicationExternalOperations,
} from "./publication-grant";
import LimitsEditor from "./LimitsEditor.vue";
import ListSearch from "./ListSearch.vue";
import { matchesSearch } from "./list-search";
import ManagedIntegrationsSelector from "./ManagedIntegrationsSelector.vue";
import PermissionSummary from "./PermissionSummary.vue";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import { useConfirmation } from "./useConfirmation";
import { tokenValidity, tokenValidityLabels } from "./token-validity";
import type { QueryLimits, OperationLimits } from "../../../src/domain/persona-v2/execution-limits";
import type { FederationBudget } from "../../../src/domain/persona-v2/federation";
interface Permissions {
  managedIntegrationIds?: string[];
  queryLimits?: Partial<QueryLimits>;
  operationLimits?: Partial<OperationLimits>;
  sourceIds: string[];
  skills: {
    skillId: string;
    queryLimits?: Partial<QueryLimits>;
    operationLimits?: Partial<OperationLimits>;
    federationLimits?: Partial<FederationBudget>;
    capabilities: string[];
    effects: ("select" | "insert" | "update" | "delete")[];
    requireHumanApproval: boolean;
  }[];
  externalOperationIds: string[];
  administrative: string[];
  federationLimits?: Partial<FederationBudget>;
}
interface Token {
  id: string;
  name: string;
  expiresAt: string | null;
  revokedAt: string | null;
  authorizationVersion: number;
  permissions: Permissions;
  delegation: Permissions;
}
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
const tokens = ref<Token[]>([]),
  editing = ref<Token>(),
  edited = ref<Token>();
const busy = ref(false),
  error = ref(""),
  message = ref("");
const unconfirmed = ref(false);
const listState = ref<"idle" | "loading" | "loaded" | "error">("idle");
const blocked = computed(() => busy.value || props.disabled);
const search = ref("");
const stateFilter = ref("todos");
const now = ref(Date.now());
const { confirmation, ask, answer } = useConfirmation();
let clock: number | undefined;
function updateClock() {
  now.value = Date.now();
}
onMounted(() => {
  clock = window.setInterval(updateClock, 60000);
  window.addEventListener("focus", updateClock);
});
onBeforeUnmount(() => {
  window.clearInterval(clock);
  window.removeEventListener("focus", updateClock);
});
const editorHeading = ref<HTMLElement>();
const matchingTokens = computed(() =>
  tokens.value.filter(
    (token) =>
      matchesSearch(search.value, token.name) &&
      (stateFilter.value === "todos" ||
        (stateFilter.value === "nao_revogados" && !token.revokedAt) ||
        (stateFilter.value === "revogados" && !!token.revokedAt) ||
        stateFilter.value === tokenValidity(token, now.value)),
  ),
);
const externalOptions = computed(() => {
  const labels = new Map<string, string>();
  for (const p of Object.values(props.publications)) {
    try {
      for (const id of publicationExternalOperations(p))
        labels.set(id, `${p.package.name} · revisão ${p.revision}`);
    } catch {
      // Invalid publications cannot add a grant; existing IDs remain removable.
    }
  }
  for (const id of edited.value?.permissions.externalOperationIds ?? [])
    if (!labels.has(id)) labels.set(id, `Operação sem publicação disponível (${id})`);
  return [...labels].map(([id, label]) => ({ id, label }));
});
const dirty = computed(
  () => !!edited.value && JSON.stringify(edited.value) !== JSON.stringify(editing.value),
);
watch(dirty, (v) => emit("dirty", v));
let live = true;
let loadedRefresh = -1;
onBeforeUnmount(() => {
  live = false;
  emit("dirty", false);
});
async function load() {
  loadedRefresh = props.refresh;
  listState.value = "loading";
  try {
    const response = await props.api<{ tokens: Token[] }>(`${props.base}/tokens`);
    if (live) {
      tokens.value = response.tokens;
      loadedRefresh = props.refresh;
      listState.value = "loaded";
    }
  } catch (cause) {
    if (live) listState.value = "error";
    throw cause;
  }
}
async function run(action: () => Promise<void>, mutation = false) {
  if (blocked.value) return;
  if (mutation && unconfirmed.value) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (e) {
    if (live && mutation && e instanceof ConsoleRequestError && e.code === "RESPONSE_UNCONFIRMED") {
      unconfirmed.value = true;
      emit("bearer", "");
    }
    if (live) error.value = e instanceof Error ? e.message : "Não foi possível concluir.";
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
    if (!props.disabled && loadedRefresh !== props.refresh) void run(load);
  },
);
async function reloadEditing() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  const id = editing.value?.id;
  await run(async () => {
    await load();
    const latest = tokens.value.find((token) => token.id === id);
    editing.value = latest;
    edited.value = latest ? (JSON.parse(JSON.stringify(latest)) as Token) : undefined;
    unconfirmed.value = false;
  });
}
async function edit(token: Token) {
  if (dirty.value && !(await props.confirmDiscard())) return;
  editing.value = token;
  edited.value = JSON.parse(JSON.stringify(token)) as Token;
  await nextTick();
  editorHeading.value?.focus();
}
function grant(skillId: string, checked: boolean) {
  if (!edited.value || blocked.value) return;
  try {
    const publication = props.publications[skillId];
    if (checked && !publication) throw new Error("Publicação indisponível; atualize a lista.");
    const added = checked ? publicationGrant(skillId, publication) : undefined;
    edited.value.permissions.skills = edited.value.permissions.skills.filter(
      (g) => g.skillId !== skillId,
    );
    if (added) edited.value.permissions.skills.push(added);
    if (added) {
      edited.value.permissions.externalOperationIds = [
        ...new Set([
          ...edited.value.permissions.externalOperationIds,
          ...publicationExternalOperations(publication),
        ]),
      ];
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Concessão indisponível.";
  }
}
async function save(rotate = false) {
  if (!edited.value || !editing.value || unconfirmed.value) return;
  if (
    rotate &&
    !(await ask({
      title: "Gerar novo token?",
      description:
        "O token anterior e seus acessos derivados serão invalidados imediatamente. As alterações deste formulário também serão salvas. Copie o novo valor após confirmar; ele não poderá ser recuperado depois.",
      confirmLabel: "Gerar e invalidar o anterior",
    }))
  )
    return;
  await run(async () => {
    const token = edited.value!;
    const response = await props.api<{ bearer?: string }>(
      `${props.base}/tokens/${token.id}/${rotate ? "rotacionar" : "editar"}`,
      {
        expectedVersion: editing.value!.authorizationVersion,
        name: token.name,
        expiresAt: token.expiresAt,
        permissions: token.permissions,
        delegation: token.delegation,
      },
    );
    if (response.bearer) emit("bearer", response.bearer);
    editing.value = undefined;
    edited.value = undefined;
    await load();
    message.value = rotate
      ? "Token rotacionado. Copie o novo valor; o anterior foi invalidado."
      : "Token atualizado. Acessos derivados anteriores foram invalidados.";
  }, true);
}
async function revoke(token: Token) {
  if (unconfirmed.value) return;
  if (blocked.value) return;
  if (
    !(await ask({
      title: `Revogar ${token.name}?`,
      description: `Este token e suas conexões OAuth derivadas perderão acesso às ${token.permissions.skills.length} skills concedidas. Outros tokens permanecem válidos. Efeitos já executados não serão desfeitos.`,
      confirmLabel: "Confirmar revogação",
    }))
  )
    return;
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
function localExpiry(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function setExpiry(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (edited.value) edited.value.expiresAt = value ? new Date(value).toISOString() : null;
}
function status(token: Token) {
  return tokenValidityLabels[tokenValidity(token, now.value)];
}
</script>
<template>
  <section aria-label="Gerenciar tokens" :aria-busy="busy" class="access-card">
    <ConfirmationDialog v-if="confirmation" v-bind="confirmation" @answer="answer" />
    <div class="access-card-heading">
      <div>
        <h3>Tokens cadastrados</h3>
        <p class="field-help">Revise quem pode acessar esta persona e quais permissões recebeu.</p>
      </div>
      <button class="secondary" :disabled="blocked" @click="run(load)">
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
            <option value="todos">Todos</option>
            <option value="ativo">Ativos (mais de 7 dias ou sem expiração)</option>
            <option value="vence_em_breve">Vencem em até 7 dias</option>
            <option value="expirado">Expirados</option>
            <option value="nao_revogados">Não revogados (podem estar expirados)</option>
            <option value="revogados">Revogados</option>
          </select></label
        >
      </template>
    </div>
    <div v-if="tokens.length && !matchingTokens.length" class="notice" role="status">
      <p>Nenhum token corresponde aos filtros. Escolha “Todos” ou limpe a busca.</p>
      <button
        type="button"
        class="secondary"
        @click="
          search = '';
          stateFilter = 'todos';
        "
      >
        Limpar filtros
      </button>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <div v-if="unconfirmed" role="status" class="notice">
      <p>
        Alteração sem confirmação. Confira o cadastro antes de fazer outra alteração. Uma rotação
        concluída não permite recuperar o segredo perdido.
      </p>
      <button class="secondary" :disabled="blocked" @click="reloadEditing">
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
              'access-status-muted': ['revogado', 'desconhecido'].includes(
                tokenValidity(token, now),
              ),
              'access-status-warning': tokenValidity(token, now) === 'vence_em_breve',
              'access-status-expired': tokenValidity(token, now) === 'expirado',
            }"
            >{{ status(token) }}</span
          >
        </div>
        <p class="field-help">
          {{
            token.expiresAt
              ? `Validade: ${new Date(token.expiresAt).toLocaleString()}`
              : "Sem expiração"
          }}
          · {{ token.permissions.skills.length }} skills concedidas
        </p>
        <p v-if="edited?.id === token.id" class="field-help">
          Em edição{{ dirty ? " · alterações não salvas" : "" }}
        </p>
        <div class="access-actions">
          <button class="secondary" :disabled="blocked || !!token.revokedAt" @click="edit(token)">
            Editar {{ token.name }}
          </button>
          <button
            class="danger"
            :disabled="blocked || unconfirmed || !!token.revokedAt"
            @click="revoke(token)"
          >
            Revogar {{ token.name }}
          </button>
        </div>
      </li>
    </ul>
    <form v-if="edited" aria-label="Editar token" class="access-editor" @submit.prevent="save()">
      <h4 ref="editorHeading" tabindex="-1">Editar {{ editing?.name }}</h4>
      <p class="field-help">
        Revise as permissões antes de salvar. Versão do cadastro:
        {{ editing?.authorizationVersion }}.
      </p>
      <fieldset :disabled="blocked">
        <p
          v-if="
            tokens.find((token) => token.id === edited?.id)?.authorizationVersion !==
            editing?.authorizationVersion
          "
          class="notice"
        >
          O token foi alterado no servidor. Sua edição local permanece preservada.
        </p>
        <button type="button" class="secondary" @click="reloadEditing">
          Recarregar edição do token
        </button>
        <details>
          <summary>Comparar edição e cadastro atual</summary>
          <pre>{{
            JSON.stringify(
              { atual: tokens.find((token) => token.id === edited?.id), edicao: edited },
              null,
              2,
            )
          }}</pre>
        </details>
        <label>Nome do consumidor<input v-model="edited.name" required maxlength="200" /></label>
        <label
          >Validade (horário local)<input
            type="datetime-local"
            :value="localExpiry(edited.expiresAt)"
            @input="setExpiry"
        /></label>
        <p>Deixe a validade vazia somente se desejar um token sem expiração.</p>
        <h4>Bases autorizadas</h4>
        <details>
          <summary>Limites do token e da delegação</summary>
          <LimitsEditor
            v-model="edited.permissions.queryLimits"
            kind="query"
            label="Consultas deste token"
          />
          <LimitsEditor
            v-model="edited.permissions.operationLimits"
            kind="operation"
            label="Lançamentos deste token"
          />
          <LimitsEditor
            v-model="edited.permissions.federationLimits"
            kind="federation"
            label="Cruzamentos deste token"
          />
          <LimitsEditor
            v-model="edited.delegation.queryLimits"
            kind="query"
            label="Teto para delegar consultas"
          />
          <LimitsEditor
            v-model="edited.delegation.operationLimits"
            kind="operation"
            label="Teto para delegar lançamentos"
          />
          <LimitsEditor
            v-model="edited.delegation.federationLimits"
            kind="federation"
            label="Teto para delegar cruzamentos"
          />
          <div v-for="g in edited.delegation.skills" :key="g.skillId">
            <p>{{ publications[g.skillId]?.package.name ?? g.skillId }}</p>
            <LimitsEditor v-model="g.queryLimits" kind="query" label="Delegação desta consulta" />
            <LimitsEditor
              v-model="g.operationLimits"
              kind="operation"
              label="Delegação deste lançamento"
            />
            <LimitsEditor
              v-model="g.federationLimits"
              kind="federation"
              label="Delegação deste cruzamento"
            />
          </div>
        </details>
        <label v-for="source in sources" :key="source.id" class="check"
          ><input v-model="edited.permissions.sourceIds" type="checkbox" :value="source.id" />{{
            source.name
          }}</label
        >
        <h4>Concessões atuais</h4>
        <fieldset v-if="externalOptions.length">
          <legend>Operações externas autorizadas</legend>
          <p>Executar exige a operação e a skill concedidas. Remover uma delas bloqueia o uso.</p>
          <label v-for="option in externalOptions" :key="option.id" class="check">
            <input
              v-model="edited.permissions.externalOperationIds"
              type="checkbox"
              :value="option.id"
            />
            {{ option.label }}
          </label>
        </fieldset>
        <label v-for="option in administrativeOptions" :key="option.id" class="check">
          <input v-model="edited.permissions.administrative" type="checkbox" :value="option.id" />{{
            option.label
          }}
        </label>
        <p>
          Exige delegação vigente no hub e autenticação do responsável no setup. Não concede
          consulta nem aprovação de lançamentos.
        </p>
        <ManagedIntegrationsSelector
          v-if="edited.permissions.administrative.includes('gerenciar_integracoes')"
          v-model="edited.permissions.managedIntegrationIds"
          :api="api"
          :base="base"
          :disabled="blocked"
        />
        <div v-for="g in edited.permissions.skills" :key="g.skillId">
          <details>
            <summary>Limites desta concessão</summary>
            <LimitsEditor v-model="g.queryLimits" kind="query" label="Concessão de consulta" />
            <LimitsEditor
              v-model="g.operationLimits"
              kind="operation"
              label="Concessão de lançamento"
            />
            <LimitsEditor
              v-model="g.federationLimits"
              kind="federation"
              label="Concessão de cruzamento"
            />
          </details>
          <span
            >{{ publications[g.skillId]?.package.name ?? g.skillId }} · {{ g.effects.join(", ") }} ·
            {{ g.capabilities.length }} capacidades</span
          >
          <label class="check"
            ><input v-model="g.requireHumanApproval" type="checkbox" />Exigir aprovação
            adicional</label
          >
          <button type="button" class="secondary" @click="grant(g.skillId, false)">
            Remover concessão
          </button>
          <fieldset
            v-if="
              publications[g.skillId]?.package.requiredCapabilities.some((c) =>
                c.startsWith('field-use:'),
              )
            "
          >
            <legend>Finalidades concedidas por campo</legend>
            <label
              v-for="capability in publications[g.skillId]!.package.requiredCapabilities.filter(
                (c) => c.startsWith('field-use:'),
              )"
              :key="capability"
              class="check"
            >
              <input v-model="g.capabilities" type="checkbox" :value="capability" />{{
                fieldCapabilityLabel(capability)
              }}
            </label>
            <p>
              A publicação exige seu conjunto completo. Remover uma finalidade bloqueia a skill
              inteira; não libera uma consulta parcial.
            </p>
          </fieldset>
        </div>
        <details>
          <summary>Adicionar capacidades publicadas</summary>
          <p>
            Um cruzamento exige concessão explícita de todas as suas consultas dependentes e bases.
            Selecionar o cruzamento não adiciona outras concessões.
          </p>
          <p>
            Adicionar utiliza as capacidades e efeitos da revisão publicada indicada. Operações SQL
            recebem aprovação adicional; a política da skill continua obrigatória. Concessões
            existentes são preservadas até alteração explícita.
          </p>
          <label v-for="(p, id) in publications" :key="id" class="check"
            ><input
              type="checkbox"
              :checked="edited.permissions.skills.some((g) => g.skillId === id)"
              :disabled="!!p.suspendedAt || edited.permissions.skills.some((g) => g.skillId === id)"
              @change="grant(String(id), ($event.target as HTMLInputElement).checked)"
            />{{ p.package.name }} · revisão {{ p.revision }} ·
            {{ publicationEffectsLabel(p) }}</label
          >
        </details>
        <p class="notice">
          Salvar ou gerar novo token invalida concessões derivadas anteriores. Permissões
          administrativas, integrações e limites existentes são preservados; sua gestão completa
          ainda está pendente.
        </p>
        <PermissionSummary
          :permissions="edited.permissions"
          :publications="publications"
          :sources="sources"
        />
        <button :disabled="unconfirmed">Salvar token</button
        ><button type="button" class="secondary" :disabled="unconfirmed" @click="save(true)">
          Gerar novo token
        </button>
        <button
          type="button"
          class="secondary"
          @click="
            edited = undefined;
            editing = undefined;
          "
        >
          Descartar edição do token
        </button>
      </fieldset>
    </form>
  </section>
</template>
