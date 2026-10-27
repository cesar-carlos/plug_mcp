<script setup lang="ts">
import BinaryAttachmentEditor from "./BinaryAttachmentEditor.vue";
import FieldUseEditor from "./FieldUseEditor.vue";
import LimitsEditor from "./LimitsEditor.vue";
import type { Training } from "./model";
import {
  queryAttachmentBytes,
  queryAttachmentMib,
  queryAttachmentMinutes,
  queryAttachmentTtlMs,
  queryHasPendingName,
} from "./query-training";
import { addTrainingColumn, toggleTrainingAttachments } from "./training-draft";

const training = defineModel<Training>({ required: true });
</script>
<template>
  <h3>Colunas</h3>
  <LimitsEditor v-model="training.limits" kind="query" label="Limites desta skill de consulta" />
  <fieldset>
    <legend>Anexos desta consulta</legend>
    <label class="check"
      ><input
        type="checkbox"
        :checked="!!training.attachments"
        @change="toggleTrainingAttachments(training, ($event.target as HTMLInputElement).checked)"
      />Permitir anexos JSON após publicação e concessão explícitas</label
    >
    <template v-if="training.attachments">
      <label
        >Limite do arquivo (MiB)<input
          type="number"
          min="0.25"
          max="8"
          step="0.25"
          :value="queryAttachmentMib(training.attachments.maxBytes)"
          required
          @input="
            training.attachments.maxBytes = queryAttachmentBytes(
              ($event.target as HTMLInputElement).value,
            )
          "
      /></label>
      <label
        >Validade do anexo (minutos)<input
          type="number"
          min="1"
          max="15"
          step="1"
          :value="queryAttachmentMinutes(training.attachments.ttlMs)"
          required
          @input="
            training.attachments.ttlMs = queryAttachmentTtlMs(
              ($event.target as HTMLInputElement).value,
            )
          "
      /></label>
      <p>
        Marque exportação nos campos permitidos. Tokens existentes precisam de nova concessão; esta
        edição não os amplia.
      </p>
    </template>
  </fieldset>
  <BinaryAttachmentEditor v-model="training.binaryAttachments" :columns="training.columns" />
  <div v-for="(column, i) in training.columns" :key="i" class="row">
    <label
      >Tabela<select v-model="column.table" required>
        <option value="">Selecione</option>
        <option
          v-if="
            queryHasPendingName(
              training.tables.map((item) => item.name),
              column.table,
            )
          "
          :value="column.table"
        >
          {{ column.table }} (referência pendente)
        </option>
        <option v-for="item in training.tables" :key="item.name" :value="item.name">
          {{ item.name }}
        </option>
      </select></label
    ><label>Coluna<input v-model="column.name" required /></label
    ><label>Significado<input v-model="column.meaning" required /></label
    ><label
      >Classificação<select v-model="column.classification">
        <option value="livre">Livre</option>
        <option value="sensivel">Sensível</option>
        <option value="pessoal">Pessoal</option>
        <option value="segredo">Segredo</option>
        <option value="inferido">Ainda não confirmado</option>
      </select></label
    ><button type="button" @click="training.columns.splice(i, 1)">Remover coluna</button>
    <FieldUseEditor :field="column" @change="training.columns[i] = $event" />
  </div>
  <button type="button" @click="addTrainingColumn(training)">Adicionar coluna</button>
  <p>
    Campos pessoais e sensíveis exigem finalidades e justificativa explícitas no treinamento
    publicado e concessões no token. Segredos e campos não confirmados permanecem bloqueados.
  </p>
</template>
