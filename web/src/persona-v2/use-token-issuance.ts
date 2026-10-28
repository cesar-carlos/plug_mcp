import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
  assertIssuanceSelection,
  chosenIssuanceSkills,
  clearUncertainIssuance,
  listedIssuanceTokens,
  markUncertainIssuance,
} from "./access-workspace";
import { ConsoleRequestError, type GrantPublication } from "./model";
import {
  buildNewTokenPermissions,
  selectTokenSkill,
  type PermissionLimits,
  type TokenPermissions,
  type UncertainIssuance,
} from "./token-permissions";
import { useConfirmation, type Confirmation } from "./useConfirmation";
import { tokenIssuanceBody } from "./token-request-size";

export function useTokenIssuance(input: {
  publications: { readonly value: Record<string, GrantPublication> };
  personaId: { readonly value: string };
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: { readonly value: string };
  disabled: { readonly value: boolean };
  run: (action: () => Promise<void>, form?: string) => Promise<void>;
  bearer: Ref<string>;
  uncertainIssuance: Ref<Record<string, UncertainIssuance>>;
  onStatus: (value: string) => void;
}): {
  tokenLimits: Ref<PermissionLimits>;
  tokenSkillLimits: Ref<Record<string, PermissionLimits>>;
  selectedSkills: Ref<string[]>;
  tokenAdministrative: Ref<string[]>;
  tokenAdministrativeSources: Ref<string[]>;
  tokenManagedIntegrations: Ref<string[]>;
  tokenCanDelegate: Ref<boolean>;
  tokenName: Ref<string>;
  tokenDays: Ref<number>;
  tokenNoExpiry: Ref<boolean>;
  tokenCreationOpen: Ref<boolean>;
  tokenRefresh: Ref<number>;
  permissions: ComputedRef<TokenPermissions | undefined>;
  dirty: ComputedRef<boolean>;
  issuanceRecovery: ComputedRef<UncertainIssuance | undefined>;
  confirmation: Ref<Confirmation | undefined>;
  answer: (value: boolean) => void;
  reset: () => void;
  selectSkill: (id: string, checked: boolean) => void;
  issueToken: () => Promise<void>;
  inspectUncertainIssuance: () => Promise<void>;
  startNewIssuance: () => Promise<void>;
} {
  const tokenLimits = ref<PermissionLimits>({});
  const tokenSkillLimits = ref<Record<string, PermissionLimits>>({});
  const selectedSkills = ref<string[]>([]);
  const tokenAdministrative = ref<string[]>([]);
  const tokenAdministrativeSources = ref<string[]>([]);
  const tokenManagedIntegrations = ref<string[]>([]);
  const tokenCanDelegate = ref(false);
  const tokenName = ref("");
  const tokenDays = ref(30);
  const tokenNoExpiry = ref(false);
  const tokenCreationOpen = ref(false);
  const tokenRefresh = ref(0);
  const { confirmation, ask, answer } = useConfirmation();
  const issuanceRecovery = computed(() => input.uncertainIssuance.value[input.personaId.value]);
  function reset(): void {
    tokenCreationOpen.value = false;
    tokenLimits.value = {};
    tokenSkillLimits.value = {};
    selectedSkills.value = [];
    tokenAdministrative.value = [];
    tokenAdministrativeSources.value = [];
    tokenManagedIntegrations.value = [];
    tokenCanDelegate.value = false;
    tokenName.value = "";
    tokenDays.value = 30;
    tokenNoExpiry.value = false;
  }
  function selectSkill(id: string, checked: boolean): void {
    const next = selectTokenSkill(selectedSkills.value, tokenSkillLimits.value, id, checked);
    selectedSkills.value = next.selected;
    tokenSkillLimits.value = next.skillLimits;
  }
  const permissions = computed(() => {
    try {
      return buildNewTokenPermissions({
        selectedSkillIds: selectedSkills.value,
        publications: input.publications.value,
        limits: tokenLimits.value,
        skillLimits: tokenSkillLimits.value,
        administrative: tokenAdministrative.value,
        administrativeSources: tokenAdministrativeSources.value,
        managedIntegrations: tokenManagedIntegrations.value,
      });
    } catch {
      return undefined;
    }
  });
  const dirty = computed(
    () =>
      Object.keys(tokenLimits.value).some(
        (key) => tokenLimits.value[key as keyof PermissionLimits] !== undefined,
      ) ||
      !!tokenName.value ||
      tokenAdministrative.value.length > 0 ||
      tokenAdministrativeSources.value.length > 0 ||
      tokenManagedIntegrations.value.length > 0 ||
      tokenCanDelegate.value ||
      selectedSkills.value.length > 0 ||
      tokenNoExpiry.value ||
      tokenDays.value !== 30,
  );
  async function issueToken(): Promise<void> {
    if (issuanceRecovery.value) {
      return;
    }
    await input.run(async () => {
      const chosen = chosenIssuanceSkills(selectedSkills.value, input.publications.value);
      assertIssuanceSelection(chosen, tokenAdministrative.value);
      const nextPermissions = buildNewTokenPermissions({
        selectedSkillIds: selectedSkills.value,
        publications: input.publications.value,
        limits: tokenLimits.value,
        skillLimits: tokenSkillLimits.value,
        administrative: tokenAdministrative.value,
        administrativeSources: tokenAdministrativeSources.value,
        managedIntegrations: tokenManagedIntegrations.value,
      });
      const ownerPersona = input.personaId.value;
      const issued = await input
        .api<{ bearer: string }>(
          `${input.base.value}/tokens`,
          tokenIssuanceBody(
            {
              name: tokenName.value,
              noExpiry: tokenNoExpiry.value,
              days: tokenDays.value,
              canDelegate: tokenCanDelegate.value,
              permissions: nextPermissions,
            },
            Date.now(),
          ),
        )
        .catch((cause: unknown) => {
          if (cause instanceof ConsoleRequestError && cause.code === "RESPONSE_UNCONFIRMED") {
            input.uncertainIssuance.value = markUncertainIssuance(
              input.uncertainIssuance.value,
              ownerPersona,
            );
            input.bearer.value = "";
            tokenRefresh.value++;
          }
          throw cause;
        });
      tokenRefresh.value++;
      input.bearer.value = issued.bearer;
      reset();
      tokenCreationOpen.value = true;
      input.onStatus("Token emitido. Copie agora; ele fica somente na memória desta página.");
    });
  }
  async function inspectUncertainIssuance(): Promise<void> {
    const recovery = issuanceRecovery.value;
    if (!recovery) {
      return;
    }
    recovery.checked = false;
    await input.run(async () => {
      const current = issuanceRecovery.value;
      if (!current) {
        return;
      }
      const result = await input.api<{
        tokens: { id: string; name: string; revokedAt: string | null }[];
      }>(`${input.base.value}/tokens`);
      if (issuanceRecovery.value !== current) {
        return;
      }
      current.tokens = listedIssuanceTokens(result.tokens);
      current.checked = true;
      tokenRefresh.value++;
    });
  }
  async function startNewIssuance(): Promise<void> {
    if (input.disabled.value || !issuanceRecovery.value?.checked) {
      return;
    }
    if (
      !(await ask({
        title: "Iniciar nova emissão?",
        description:
          "A emissão anterior pode ter sido concluída. Confira e revogue o token sem segredo na lista, se necessário. Esta confirmação apenas libera o formulário; não emite outro token automaticamente.",
        confirmLabel: "Iniciar nova emissão",
      }))
    ) {
      return;
    }
    if (input.disabled.value || !issuanceRecovery.value?.checked) {
      return;
    }
    reset();
    tokenCreationOpen.value = true;
    input.uncertainIssuance.value = clearUncertainIssuance(
      input.uncertainIssuance.value,
      input.personaId.value,
    );
  }
  return {
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
    permissions,
    dirty,
    issuanceRecovery,
    confirmation,
    answer,
    reset,
    selectSkill,
    issueToken,
    inspectUncertainIssuance,
    startNewIssuance,
  };
}
