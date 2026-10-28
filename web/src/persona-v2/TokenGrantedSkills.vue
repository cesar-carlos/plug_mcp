<script setup lang="ts">
import { fieldCapabilityLabel, fieldUseCapabilities } from "./field-capabilities";
import LimitsEditor from "./LimitsEditor.vue";
import type { GrantPublication } from "./model";
import type { TokenPermissions } from "./token-permissions";

defineProps<{
  publications: Record<string, GrantPublication>;
}>();
const grants = defineModel<TokenPermissions["skills"]>({ required: true });
const emit = defineEmits<{
  remove: [skillId: string];
}>();
</script>
<template>
  <div v-for="g in grants" :key="g.skillId">
    <details>
      <summary>Limites desta concessão</summary>
      <LimitsEditor v-model="g.queryLimits" kind="query" label="Concessão de consulta" />
      <LimitsEditor v-model="g.operationLimits" kind="operation" label="Concessão de lançamento" />
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
      ><input v-model="g.requireHumanApproval" type="checkbox" />Exigir aprovação adicional</label
    >
    <button type="button" class="secondary" @click="emit('remove', g.skillId)">
      Remover concessão
    </button>
    <details
      v-if="
        fieldUseCapabilities(publications[g.skillId]?.package.requiredCapabilities ?? []).length
      "
    >
      <summary>
        Finalidades concedidas por campo ({{
          fieldUseCapabilities(publications[g.skillId]?.package.requiredCapabilities ?? []).length
        }})
      </summary>
      <label
        v-for="capability in fieldUseCapabilities(
          publications[g.skillId]?.package.requiredCapabilities ?? [],
        )"
        :key="capability"
        class="check"
      >
        <input v-model="g.capabilities" type="checkbox" :value="capability" />{{
          fieldCapabilityLabel(capability)
        }}
      </label>
      <p>
        A publicação exige seu conjunto completo. Remover uma finalidade bloqueia a skill inteira;
        não libera uma consulta parcial.
      </p>
    </details>
  </div>
</template>
