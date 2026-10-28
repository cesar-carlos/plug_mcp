<script setup lang="ts">
import { computed } from "vue";
import TokenRequestSize from "./TokenRequestSize.vue";
import { tokenIssuanceBody, tokenRequestSize } from "./token-request-size";
import { administrativeOptions } from "./administrative-options";
import { groupedFieldLabels } from "./token-list";
import LimitsEditor from "./LimitsEditor.vue";
import ManagedIntegrationsSelector from "./ManagedIntegrationsSelector.vue";
import type { GrantPublication, Source } from "./model";
import PermissionSummary from "./PermissionSummary.vue";
import { publicationEffectsLabel } from "./publication-grant";
import TokenSkillList from "./TokenSkillList.vue";
import type { PermissionLimits, TokenPermissions } from "./token-permissions";

const props = defineProps<{
  busy: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  publications: Record<string, GrantPublication>;
  sources: Source[];
  permissions?: TokenPermissions;
  issuanceRecovery?: {
    checked: boolean;
    tokens: { id: string; name: string; revokedAt: string | null }[];
  };
}>();
const tokenName = defineModel<string>("tokenName", { required: true });
const selectedSkills = defineModel<string[]>("selectedSkills", { required: true });
const tokenLimits = defineModel<PermissionLimits>("tokenLimits", { required: true });
const tokenSkillLimits = defineModel<Record<string, PermissionLimits>>("tokenSkillLimits", {
  required: true,
});
const tokenAdministrative = defineModel<string[]>("tokenAdministrative", { required: true });
const tokenAdministrativeSources = defineModel<string[]>("tokenAdministrativeSources", {
  required: true,
});
const tokenManagedIntegrations = defineModel<string[]>("tokenManagedIntegrations", {
  required: true,
});
const tokenCanDelegate = defineModel<boolean>("tokenCanDelegate", { required: true });
const tokenNoExpiry = defineModel<boolean>("tokenNoExpiry", { required: true });
const tokenDays = defineModel<number>("tokenDays", { required: true });
const requestBody = computed(() => {
  if (
    !props.permissions ||
    (!tokenNoExpiry.value &&
      (!Number.isFinite(tokenDays.value) || tokenDays.value < 1 || tokenDays.value > 3650))
  )
    return undefined;
  return tokenIssuanceBody(
    {
      name: tokenName.value,
      noExpiry: tokenNoExpiry.value,
      days: tokenDays.value,
      canDelegate: tokenCanDelegate.value,
      permissions: props.permissions,
    },
    Date.now(),
  );
});
const tooLarge = computed(() =>
  requestBody.value ? tokenRequestSize(requestBody.value).exceeded : false,
);
const emit = defineEmits<{
  collapse: [];
  inspect: [];
  startNew: [];
  issue: [];
  selectSkill: [id: string, checked: boolean];
}>();
const issuanceSkillOptions = computed(() =>
  Object.entries(props.publications).flatMap(([id, publication]) =>
    publication
      ? [
          {
            id,
            label: `${publication.package.name} · revisão ${publication.revision}${publication.package.format === "persona-query-v2" ? "" : ` · ${publicationEffectsLabel(publication)}`}`,
            checked: selectedSkills.value.includes(id),
            disabled: !!publication.suspendedAt,
            details: groupedFieldLabels(publication.package.requiredCapabilities),
          },
        ]
      : [],
  ),
);
</script>
<template>
  <section id="access-new-token" role="tabpanel" class="access-card" tabindex="-1">
    <h3>Emitir token da persona</h3>
    <button
      type="button"
      class="secondary"
      :disabled="!!issuanceRecovery"
      @click="emit('collapse')"
    >
      Recolher formulário
    </button>
    <p class="field-help">
      Recolher mantém suas escolhas nesta persona. Sair com alterações pendentes exige confirmação.
    </p>
    <p class="field-help">
      Crie um acesso individual, escolha as permissões e defina sua validade.
    </p>
    <section v-if="issuanceRecovery" aria-label="Conferir emissão sem confirmação" class="notice">
      <p>
        A emissão pode ter sido concluída. Não repita o envio. Confira os tokens cadastrados; o
        segredo perdido não pode ser recuperado.
      </p>
      <button :disabled="busy" class="secondary" @click="emit('inspect')">
        Conferir tokens antes de nova emissão
      </button>
      <ul v-if="issuanceRecovery.checked">
        <li v-for="item in issuanceRecovery.tokens" :key="item.id">
          {{ item.name }} · {{ item.id }} · {{ item.revokedAt ? "Revogado" : "Não revogado" }}
        </li>
      </ul>
      <p v-if="issuanceRecovery.checked">
        A listagem não identifica automaticamente qual cadastro corresponde à tentativa. Revise o
        consumidor e as concessões em Gerenciar tokens.
      </p>
      <button
        :disabled="busy || !issuanceRecovery.checked"
        class="secondary"
        @click="emit('startNew')"
      >
        Iniciar nova emissão
      </button>
    </section>
    <form aria-label="Emitir token" @submit.prevent="!tooLarge && emit('issue')">
      <fieldset :disabled="busy || !!issuanceRecovery">
        <label>Nome do consumidor<input v-model="tokenName" required maxlength="200" /></label>
        <h4>Escolha o que este token pode acessar</h4>
        <TokenRequestSize v-if="requestBody" :body="requestBody" />
        <details class="token-form-section" open>
          <summary>Consultas e operações · {{ selectedSkills.length }} selecionada(s)</summary>
          <p v-if="!Object.keys(publications).length" class="notice">
            Nenhuma skill publicada disponível. Publique uma skill em Treinamentos para conceder
            acesso às consultas ou operações.
          </p>
          <p class="field-help" role="status">
            {{ selectedSkills.length }} skill(s) selecionada(s) ·
            {{ tokenAdministrative.length }} permissão(ões) administrativa(s).
          </p>
          <details class="token-permission-help">
            <summary>Como funcionam estas permissões</summary>
            <p>
              Selecione consultas, cruzamentos, operações SQL ou capacidades externas. Selecionar
              uma capacidade externa concede também sua operação específica. Novos lançamentos SQL e
              ações externas exigem aprovação adicional; a política da skill continua obrigatória.
              Cada cruzamento exige selecionar também suas consultas dependentes; nenhuma concessão
              será adicionada automaticamente.
            </p>
          </details>
          <TokenSkillList
            :options="issuanceSkillOptions"
            :publications="publications"
            :sources="sources"
            @change="(id, checked) => emit('selectSkill', id, checked)"
          />
        </details>
        <details class="token-form-section">
          <summary>Limites do novo token</summary>
          <LimitsEditor
            v-model="tokenLimits.queryLimits"
            kind="query"
            label="Consultas do novo token"
          />
          <LimitsEditor
            v-model="tokenLimits.operationLimits"
            kind="operation"
            label="Lançamentos do novo token"
          />
          <LimitsEditor
            v-model="tokenLimits.federationLimits"
            kind="federation"
            label="Cruzamentos do novo token"
          />
          <div v-for="id in selectedSkills" :key="id">
            <p>{{ publications[id]?.package.name }}</p>
            <LimitsEditor
              v-if="tokenSkillLimits[id]"
              v-model="tokenSkillLimits[id].queryLimits"
              kind="query"
              label="Concessão desta consulta"
            />
            <LimitsEditor
              v-if="tokenSkillLimits[id]"
              v-model="tokenSkillLimits[id].federationLimits"
              kind="federation"
              label="Concessão deste cruzamento"
            />
          </div>
        </details>
        <p>
          Selecione explicitamente as consultas. Novas fontes e treinamentos não ampliam este token.
        </p>
        <p>
          Selecionar uma publicação concede o conjunto de campos e finalidades exibido. Uma
          concessão incompleta bloqueia a publicação inteira.
        </p>
        <label class="check"
          ><input v-model="tokenNoExpiry" type="checkbox" />Sem expiração (escolha explícita)</label
        >
        <label v-if="!tokenNoExpiry"
          >Validade em dias<input
            v-model.number="tokenDays"
            type="number"
            min="1"
            max="3650"
            required
        /></label>
        <details class="token-form-section">
          <summary>
            Administração e delegação · {{ tokenAdministrative.length }} permissão(ões)
          </summary>
          <fieldset>
            <legend>Permissões administrativas</legend>
            <label v-for="option in administrativeOptions" :key="option.id" class="check"
              ><input v-model="tokenAdministrative" type="checkbox" :value="option.id" />{{
                option.label
              }}</label
            >
            <p>
              Administração exige também delegação vigente no hub. Não substitui autorização para
              consultar ou aprovação humana.
            </p>
            <label
              v-for="source in sources.filter((item) => item.active)"
              :key="source.id"
              class="check"
              ><input v-model="tokenAdministrativeSources" type="checkbox" :value="source.id" />Base
              para administração: {{ source.name }}</label
            >
            <label class="check"
              ><input v-model="tokenCanDelegate" type="checkbox" />Permitir delegar as concessões
              selecionadas a outros tokens</label
            >
            <ManagedIntegrationsSelector
              v-if="tokenAdministrative.includes('gerenciar_integracoes')"
              v-model="tokenManagedIntegrations"
              :api="api"
              :base="base"
              :disabled="busy"
            />
          </fieldset>
        </details>
        <PermissionSummary
          v-if="permissions"
          :permissions="permissions"
          :publications="publications"
          :sources="sources"
        />
        <p v-else role="alert" class="error">
          Não foi possível preparar o resumo. Revise as publicações selecionadas.
        </p>
        <p v-if="tokenCanDelegate" class="notice">
          Este token poderá delegar as permissões acima, dentro dos limites selecionados.
        </p>
        <p v-if="permissions" class="notice" aria-label="Resumo da emissão" role="status">
          {{ permissions.skills.length }} consulta(s) e operação(ões) ·
          {{ permissions.sourceIds.length }} base(s) ·
          {{ permissions.administrative.length }} permissão(ões) administrativa(s). Delegação:
          {{ tokenCanDelegate ? "permitida dentro das concessões selecionadas" : "não permitida" }}.
          {{ tokenNoExpiry ? "Sem expiração." : `Validade: ${tokenDays} dia(s).` }}
        </p>
        <button
          :disabled="
            tooLarge || !permissions || (!selectedSkills.length && !tokenAdministrative.length)
          "
        >
          Emitir token restrito
        </button>
      </fieldset>
    </form>
  </section>
</template>
