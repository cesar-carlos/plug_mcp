<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import AccessBearerSession from "./AccessBearerSession.vue";
import AccessTokenTabs from "./AccessTokenTabs.vue";
import { ACCESS_TOKEN_TAB_SECTIONS, type AccessTokenTab } from "./access-workspace";
import ConfirmationDialog from "./ConfirmationDialog.vue";
import ConnectionPanel from "./ConnectionPanel.vue";
import OAuthConnectionInfo from "./OAuthConnectionInfo.vue";
import OAuthConnectionsPanel from "./OAuthConnectionsPanel.vue";
import OwnerDelegationPanel from "./OwnerDelegationPanel.vue";
import TokenIssuanceForm from "./TokenIssuanceForm.vue";
import TokenManager from "./TokenManager.vue";
import type { GrantPublication, Persona, Source } from "./model";
import type { UncertainIssuance } from "./token-permissions";
import { useTokenIssuance } from "./use-token-issuance";

const props = defineProps<{
  active: boolean;
  persona: Persona;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  publications: Record<string, GrantPublication>;
  sources: Source[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  run: (action: () => Promise<void>, form?: string) => Promise<void>;
  call: <T>(tool: string, args: unknown) => Promise<T>;
}>();
const bearer = defineModel<string>("bearer", { required: true });
const uncertainIssuance = defineModel<Record<string, UncertainIssuance>>("uncertainIssuance", {
  required: true,
});
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  status: [value: string];
}>();

const publicationsRef = computed(() => props.publications);
const personaId = computed(() => props.persona.id);
const base = computed(() => props.base);
const disabled = computed(() => props.disabled);
const {
  tokenLimits,
  tokenSkillLimits,
  selectedSkills,
  tokenAdministrative,
  tokenAdministrativeSources,
  tokenManagedIntegrations,
  tokenCanDelegate,
  tokenName,
  tokenDays,
  tokenNoExpiry,
  tokenCreationOpen,
  tokenRefresh,
  permissions: newTokenPermissions,
  dirty: issuanceDirty,
  issuanceRecovery,
  confirmation,
  answer,
  selectSkill,
  issueToken,
  inspectUncertainIssuance,
  startNewIssuance,
} = useTokenIssuance({
  publications: publicationsRef,
  personaId,
  api: (url, body) => props.api(url, body),
  base,
  disabled,
  run: (action, form) => props.run(action, form),
  bearer,
  uncertainIssuance,
  onStatus: (value) => emit("status", value),
  onIssued: (value) => void presentToken(value),
});
const tokenTab = ref<AccessTokenTab>("list");
const tokenGenerated = ref(false);
async function presentToken(value: string): Promise<void> {
  bearer.value = value;
  if (!value) return;
  tokenGenerated.value = true;
  await selectTokenTab("connect");
}
watch(bearer, (value) => {
  if (!value) tokenGenerated.value = false;
});
const tokenManagerDirty = ref(false);
const tokenManagerKey = ref(0);
const oauthConnectionsDirty = ref(false);
const oauthConnectionsKey = ref(0);
const delegationDirty = ref(false);
const delegationKey = ref(0);
const dirty = computed(
  () =>
    oauthConnectionsDirty.value ||
    issuanceDirty.value ||
    delegationDirty.value ||
    tokenManagerDirty.value,
);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
onBeforeUnmount(() => {
  emit("dirty", false);
});

async function selectTokenTab(tab: AccessTokenTab): Promise<void> {
  tokenTab.value = tab;
  if (tab === "new") {
    tokenCreationOpen.value = true;
  }
  await nextTick();
  const alert =
    tab === "connections"
      ? document.querySelector<HTMLElement>(
          'section[aria-label="Delegação administrativa"] [role="alert"]',
        )
      : null;
  (alert ?? document.getElementById(ACCESS_TOKEN_TAB_SECTIONS[tab]))?.focus();
}
</script>
<template>
  <section class="access-page">
    <ConfirmationDialog v-if="confirmation" v-bind="confirmation" @answer="answer" />
    <p>
      Controle os acessos desta persona. Cada token tem suas próprias permissões; conexões do
      ChatGPT usam o consentimento autorizado.
    </p>
    <AccessTokenTabs :selected="tokenTab" @select="selectTokenTab" />

    <TokenManager
      v-if="active"
      v-show="tokenTab === 'list'"
      id="access-token-list"
      :key="`${persona.id}:${tokenManagerKey}`"
      tabindex="-1"
      :api="api"
      :confirm-discard="confirmDiscard"
      :base="base"
      :refresh="tokenRefresh"
      :disabled="disabled"
      :publications="publications"
      :sources="sources"
      @dirty="tokenManagerDirty = $event"
      @lock="emit('lock', $event)"
      @bearer="presentToken"
    />

    <TokenIssuanceForm
      v-show="tokenTab === 'new' && (tokenCreationOpen || issuanceRecovery)"
      v-model:token-name="tokenName"
      v-model:selected-skills="selectedSkills"
      v-model:token-limits="tokenLimits"
      v-model:token-skill-limits="tokenSkillLimits"
      v-model:token-administrative="tokenAdministrative"
      v-model:token-administrative-sources="tokenAdministrativeSources"
      v-model:token-managed-integrations="tokenManagedIntegrations"
      v-model:token-can-delegate="tokenCanDelegate"
      v-model:token-no-expiry="tokenNoExpiry"
      v-model:token-days="tokenDays"
      :busy="disabled"
      :api="api"
      :base="base"
      :publications="publications"
      :sources="sources"
      :permissions="newTokenPermissions"
      :issuance-recovery="issuanceRecovery"
      @collapse="tokenCreationOpen = false"
      @inspect="inspectUncertainIssuance"
      @start-new="startNewIssuance"
      @issue="issueToken"
      @select-skill="selectSkill"
    />

    <section
      v-show="tokenTab === 'connect'"
      id="access-connect"
      role="tabpanel"
      class="access-card"
      tabindex="-1"
    >
      <AccessBearerSession
        v-model:bearer="bearer"
        :disabled="disabled"
        :generated="tokenGenerated"
        @update:bearer="tokenGenerated = false"
        @manage="selectTokenTab('list')"
        @create="selectTokenTab('new')"
        @status="emit('status', $event)"
      />
      <details class="permission-section">
        <summary>Testar conexão (opcional)</summary>
        <ConnectionPanel
          v-if="active"
          :key="persona.id"
          :persona-id="persona.id"
          :bearer="bearer"
          :call="call"
          @lock="emit('lock', $event)"
        />
      </details>
    </section>
    <OAuthConnectionInfo
      v-if="active"
      v-show="tokenTab === 'chatgpt'"
      :key="persona.id"
      :api="api"
    />
    <OAuthConnectionsPanel
      v-if="active"
      v-show="tokenTab === 'connections'"
      :key="`${persona.id}:${oauthConnectionsKey}`"
      :api="api"
      :base="base"
      :disabled="disabled"
      :refresh="tokenRefresh"
      @dirty="oauthConnectionsDirty = $event"
      @lock="emit('lock', $event)"
    />
    <OwnerDelegationPanel
      v-if="active"
      v-show="tokenTab === 'connections'"
      :key="`delegation:${persona.id}:${delegationKey}`"
      :persona-id="persona.id"
      :visible="tokenTab === 'connections'"
      :api="api"
      @dirty="delegationDirty = $event"
      @lock="emit('lock', $event)"
    />
  </section>
</template>
