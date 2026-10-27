<script setup lang="ts">
import type { Source, Training } from "./model";

defineProps<{
  draftId: string;
  sources: Source[];
  invalidField: (field: string) => boolean;
}>();
const training = defineModel<Training>("training", { required: true });
const name = defineModel<string>("name", { required: true });
const slug = defineModel<string>("slug", { required: true });
const emit = defineEmits<{
  changeSource: [event: Event];
}>();
</script>
<template>
  <label
    >Nome<input
      v-model="name"
      data-error-field="training:name"
      :aria-invalid="invalidField('name') || undefined"
      :aria-describedby="invalidField('name') ? 'training-name-error' : undefined"
      required /></label
  ><label
    >Identificador curto<input
      v-model="slug"
      data-error-field="training:slug"
      :aria-invalid="invalidField('slug') || undefined"
      :aria-describedby="invalidField('slug') ? 'training-slug-error' : undefined"
      :disabled="!!draftId"
      pattern="[a-z0-9]+(-[a-z0-9]+)*"
      placeholder="consulta-pedidos"
      required
  /></label>
  <p v-if="invalidField('name')" id="training-name-error" class="error">
    Revise o nome do treinamento. A edição foi preservada.
  </p>
  <p v-if="invalidField('slug')" id="training-slug-error" class="error">
    Revise o identificador curto do treinamento.
  </p>
  <div
    v-if="invalidField('training')"
    data-error-field="training:training"
    tabindex="-1"
    role="group"
    aria-label="Treinamento recusado"
    aria-describedby="training-content-error"
  >
    <p id="training-content-error" class="error">
      O conteúdo do treinamento foi recusado. Revise a base, a estrutura, os exemplos, parâmetros e
      regras conforme o motivo acima. Nenhum campo foi apagado.
    </p>
  </div>
  <label
    >Base<select :value="training.sourceId" required @change="emit('changeSource', $event)">
      <option value="">Selecione</option>
      <option
        v-for="source in sources"
        :key="source.id"
        :value="source.id"
        :disabled="!source.active"
      >
        {{ source.name }}{{ source.active ? "" : " (indisponível)" }}
      </option>
    </select></label
  ><label>Objetivo da consulta<textarea v-model="training.purpose" required /></label>
</template>
