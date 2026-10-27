<script setup lang="ts">
defineProps<{
  busy: boolean;
  invalidField: (field: string) => boolean;
}>();
const name = defineModel<string>("name", { required: true });
const specialty = defineModel<string>("specialty", { required: true });
const instructions = defineModel<string>("instructions", { required: true });
const emit = defineEmits<{
  submit: [];
  icon: [file: File | undefined];
}>();
</script>
<template>
  <form aria-label="Criar persona" @submit.prevent="emit('submit')">
    <fieldset :disabled="busy">
      <label
        >Nome<input
          v-model="name"
          placeholder="Ex.: Assistente financeiro"
          data-error-field="personas:name"
          :aria-invalid="invalidField('name') || undefined"
          :aria-describedby="invalidField('name') ? 'personas-name-error' : undefined"
          maxlength="200"
          required
      /></label>
      <p v-if="invalidField('name')" id="personas-name-error" class="error">Revise este campo.</p>
      <label
        >Especialidade<textarea
          v-model="specialty"
          data-error-field="personas:specialty"
          :aria-invalid="invalidField('specialty') || undefined"
          :aria-describedby="invalidField('specialty') ? 'personas-specialty-error' : undefined"
          maxlength="5000"
          placeholder="Ex.: Contas a receber e fluxo de caixa"
          required
        />
      </label>
      <p v-if="invalidField('specialty')" id="personas-specialty-error" class="error">
        Revise este campo.
      </p>
      <label
        >Orientações<textarea
          v-model="instructions"
          data-error-field="personas:instructions"
          :aria-invalid="invalidField('instructions') || undefined"
          :aria-describedby="
            invalidField('instructions') ? 'personas-instructions-error' : undefined
          "
          maxlength="20000"
          placeholder="Ex.: Explique os resultados em português e informe as fontes usadas."
        />
      </label>
      <p v-if="invalidField('instructions')" id="personas-instructions-error" class="error">
        Revise este campo.
      </p>
      <label
        >Ícone opcional
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          @change="emit('icon', ($event.target as HTMLInputElement).files?.[0])"
        />
      </label>
      <p class="field-help">
        PNG, JPEG ou WebP. Sem arquivo, a persona usa o ícone Se7e. Isso não concede acesso.
      </p>
      <button>Criar persona</button>
    </fieldset>
  </form>
</template>
