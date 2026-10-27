<script setup lang="ts">
import {
  MAX_SOURCE_RESTRICTIONS,
  emptySourceRestriction,
  type SourceRestrictionDraft,
  type SourceSettingsIdentity,
} from "./source-settings";

defineProps<{
  busy: boolean;
  sourceName: string;
  identityDirty: boolean;
}>();
const form = defineModel<SourceSettingsIdentity>("form", { required: true });
const restrictions = defineModel<SourceRestrictionDraft[]>("restrictions", { required: true });
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <form :aria-label="`Editar base ${sourceName}`" @submit.prevent="emit('submit')">
    <fieldset :disabled="busy">
      <label>Nome da base<input v-model="form.name" maxlength="200" required /></label>
      <label>Finalidade<textarea v-model="form.purpose" maxlength="5000" required /></label>
      <label>Ambiente<input v-model="form.environment" maxlength="100" required /></label>
      <h3>Recortes obrigatórios</h3>
      <p>O treinamento deve aplicar estes filtros em todas as consultas da tabela.</p>
      <div v-for="(r, i) in restrictions" :key="i" class="row">
        <label>Tabela<input v-model="r.table" required /></label>
        <label>Coluna<input v-model="r.column" required /></label>
        <label
          >Parâmetro reservado<input
            v-model="r.parameter"
            pattern="__scope_[a-z][a-z0-9_]*"
            required
        /></label>
        <label
          >Tipo<select v-model="r.type">
            <option value="string">Texto</option>
            <option value="number">Número</option>
            <option value="boolean">Booleano</option>
          </select></label
        >
        <label
          >Valor<select v-if="r.type === 'boolean'" v-model="r.value" required>
            <option value="true">Sim</option>
            <option value="false">Não</option></select
          ><input
            v-else
            v-model="r.value"
            :type="r.type === 'number' ? 'number' : 'text'"
            :step="r.type === 'number' ? 'any' : undefined"
            required
        /></label>
        <button
          type="button"
          :aria-label="`Remover recorte ${i + 1}`"
          @click="restrictions.splice(i, 1)"
        >
          Remover
        </button>
      </div>
      <button
        type="button"
        :disabled="restrictions.length >= MAX_SOURCE_RESTRICTIONS"
        @click="restrictions.push(emptySourceRestriction())"
      >
        Adicionar recorte
      </button>
      <p class="notice">
        Salvar suspende as publicações desta fonte e os cruzamentos dependentes. Revise e publique
        novamente para voltar a consultar.
      </p>
      <button :disabled="!identityDirty">Salvar base</button>
    </fieldset>
  </form>
</template>
