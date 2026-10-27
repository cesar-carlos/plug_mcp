<script setup lang="ts">
import { computed, ref } from "vue";
import { administrativeOptions } from "./administrative-options";
import ManagedIntegrationsSelector from "./ManagedIntegrationsSelector.vue";
import type { GrantPublication, Source } from "./model";
import PermissionSummary from "./PermissionSummary.vue";
import TokenEditorLimits from "./TokenEditorLimits.vue";
import TokenExternalOperations from "./TokenExternalOperations.vue";
import TokenGrantedSkills from "./TokenGrantedSkills.vue";
import TokenSkillList from "./TokenSkillList.vue";
import { tokenExternalOperationOptions, tokenPublishedSkillOptions } from "./token-editor-options";
import { applyTokenSkillGrant, type ManagedToken } from "./token-permissions";
import { expiryFromLocalInput, localExpiryInput } from "./token-validity";

const props = defineProps<{
  editing: ManagedToken;
  tokens: ManagedToken[];
  publications: Record<string, GrantPublication>;
  sources: Source[];
  blocked: boolean;
  unconfirmed: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
}>();
const edited = defineModel<ManagedToken>("edited", { required: true });
const emit = defineEmits<{
  save: [rotate?: boolean];
  reload: [];
  discard: [];
  error: [message: string];
}>();

const heading = ref<HTMLElement>();
defineExpose({
  focus(): void {
    heading.value?.focus();
  },
});
const listed = computed(() => props.tokens.find((token) => token.id === edited.value.id));
const externalOptions = computed(() =>
  tokenExternalOperationOptions(props.publications, edited.value.permissions.externalOperationIds),
);
const publishedSkillOptions = computed(() =>
  tokenPublishedSkillOptions(
    props.publications,
    edited.value.permissions.skills.map((grant) => grant.skillId),
  ),
);

function grant(skillId: string, checked: boolean): void {
  if (props.blocked) {
    return;
  }
  try {
    edited.value.permissions = applyTokenSkillGrant(
      edited.value.permissions,
      skillId,
      checked,
      props.publications[skillId],
    );
  } catch (cause) {
    emit("error", cause instanceof Error ? cause.message : "Concessão indisponível.");
  }
}

function setExpiry(event: Event): void {
  edited.value.expiresAt = expiryFromLocalInput((event.target as HTMLInputElement).value);
}
</script>
<template>
  <form aria-label="Editar token" class="access-editor" @submit.prevent="emit('save')">
    <h4 ref="heading" tabindex="-1">Editar {{ editing.name }}</h4>
    <p class="field-help">
      Revise as permissões antes de salvar. Versão do cadastro:
      {{ editing.authorizationVersion }}.
    </p>
    <fieldset :disabled="blocked">
      <p v-if="listed?.authorizationVersion !== editing.authorizationVersion" class="notice">
        O token foi alterado no servidor. Sua edição local permanece preservada.
      </p>
      <button type="button" class="secondary" @click="emit('reload')">
        Recarregar edição do token
      </button>
      <details>
        <summary>Comparar edição e cadastro atual</summary>
        <pre>{{ JSON.stringify({ atual: listed, edicao: edited }, null, 2) }}</pre>
      </details>
      <label>Nome do consumidor<input v-model="edited.name" required maxlength="200" /></label>
      <label
        >Validade (horário local)<input
          type="datetime-local"
          :value="localExpiryInput(edited.expiresAt)"
          @input="setExpiry"
      /></label>
      <p>Deixe a validade vazia somente se desejar um token sem expiração.</p>
      <h4>Bases autorizadas</h4>
      <TokenEditorLimits
        v-model:permissions="edited.permissions"
        v-model:delegation="edited.delegation"
        :publications="publications"
      />
      <label v-for="source in sources" :key="source.id" class="check"
        ><input v-model="edited.permissions.sourceIds" type="checkbox" :value="source.id" />{{
          source.name
        }}</label
      >
      <h4>Concessões atuais</h4>
      <TokenExternalOperations
        v-model="edited.permissions.externalOperationIds"
        :options="externalOptions"
      />
      <label v-for="option in administrativeOptions" :key="option.id" class="check">
        <input v-model="edited.permissions.administrative" type="checkbox" :value="option.id" />{{
          option.label
        }}
      </label>
      <p>
        Exige delegação vigente no hub e autenticação do responsável no setup. Não concede consulta
        nem aprovação de lançamentos.
      </p>
      <ManagedIntegrationsSelector
        v-if="edited.permissions.administrative.includes('gerenciar_integracoes')"
        v-model="edited.permissions.managedIntegrationIds"
        :api="api"
        :base="base"
        :disabled="blocked"
      />
      <TokenGrantedSkills
        v-model="edited.permissions.skills"
        :publications="publications"
        @remove="grant($event, false)"
      />
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
        <TokenSkillList :options="publishedSkillOptions" @change="grant" />
      </details>
      <p class="notice">
        Salvar ou gerar novo token invalida concessões derivadas anteriores. Permissões
        administrativas, integrações e limites existentes são preservados; sua gestão completa ainda
        está pendente.
      </p>
      <PermissionSummary
        :permissions="edited.permissions"
        :publications="publications"
        :sources="sources"
      />
      <button :disabled="unconfirmed">Salvar token</button
      ><button type="button" class="secondary" :disabled="unconfirmed" @click="emit('save', true)">
        Gerar novo token
      </button>
      <button type="button" class="secondary" @click="emit('discard')">
        Descartar edição do token
      </button>
    </fieldset>
  </form>
</template>
