<script setup lang="ts">
import StructureEditor from "./StructureEditor.vue";
import type { Content } from "./knowledge-model";
import {
  publishedCurationBases,
  type CurationExample,
  type CurationProposalKind,
} from "./curation-proposal";

defineProps<{
  physical: boolean;
  bases: { id: string; name: string; activePublicationId: string | null }[];
  baseId: string;
  summary: string;
  kind: CurationProposalKind;
  rule: string;
  proposalContent: Content | undefined;
  loadedBaseId: string;
  targetId: string;
  overrideCommon: boolean;
  structuralItems: ReadonlyArray<{ id: string; meaning: string }>;
}>();
const example = defineModel<CurationExample>("example", { required: true });
const emit = defineEmits<{
  "update:baseId": [value: string];
  "update:summary": [value: string];
  "update:kind": [value: CurationProposalKind];
  "update:rule": [value: string];
  "update:proposalContent": [value: Content | undefined];
  "update:targetId": [value: string];
  "update:overrideCommon": [value: boolean];
  loadStructure: [];
  propose: [];
}>();
</script>

<template>
  <form aria-label="Propor conhecimento compartilhado" @submit.prevent="emit('propose')">
    <h4>Enviar conhecimento para revisão</h4>
    <label
      >Versão base da proposta<select
        :value="baseId"
        required
        @change="emit('update:baseId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Selecione {{ physical ? "um perfil" : "um padrão" }} publicado</option>
        <option
          v-for="p in publishedCurationBases(bases)"
          :key="p.id"
          :value="p.activePublicationId!"
        >
          {{ p.name }}
        </option>
      </select></label
    >
    <label
      >Resumo da proposta<input
        :value="summary"
        maxlength="2000"
        required
        @input="emit('update:summary', ($event.target as HTMLInputElement).value)" /></label
    ><label
      >Tipo de proposta<select
        :value="kind"
        @change="
          emit('update:kind', ($event.target as HTMLSelectElement).value as CurationProposalKind)
        "
      >
        <option value="regra">Regra de negócio</option>
        <option value="exemplo_sql">Exemplo SQL</option>
        <option value="tabela">Tabela e campos</option>
        <option value="relacionamento">Relacionamento</option>
      </select></label
    >
    <label v-if="kind === 'regra'"
      >Regra proposta<textarea
        :value="rule"
        maxlength="5000"
        required
        @input="emit('update:rule', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
    <template v-else-if="kind === 'exemplo_sql'"
      ><label
        >Identificação do exemplo<input
          v-model="example.id"
          pattern="[a-z][a-z0-9_-]*"
          required /></label
      ><label>Finalidade do exemplo<input v-model="example.purpose" required /></label
      ><label>Explicação do exemplo<textarea v-model="example.explanation" required /></label>
      <fieldset v-for="(variant, index) in example.variants" :key="index">
        <legend>Variante {{ index + 1 }}</legend>
        <label
          >Dialeto do exemplo<select v-model="variant.dialect">
            <option value="postgres">PostgreSQL</option>
            <option value="mssql">SQL Server</option>
            <option value="sybase">SQL Anywhere</option>
          </select></label
        ><label
          >SQL proposto<textarea v-model="variant.sql" class="sql" spellcheck="false" required />
        </label>
        <div v-for="(parameter, pIndex) in variant.parameters" :key="pIndex">
          <label>Nome do parâmetro<input v-model="parameter.name" required /></label
          ><label
            >Tipo do parâmetro<select v-model="parameter.type">
              <option value="string">Texto</option>
              <option value="integer">Inteiro</option>
              <option value="decimal">Decimal exato</option>
              <option value="boolean">Booleano</option>
              <option value="date">Data</option>
              <option value="datetime">Data e hora</option>
            </select></label
          ><label>Significado do parâmetro<input v-model="parameter.meaning" required /></label
          ><label class="check"
            ><input v-model="parameter.required" type="checkbox" />Obrigatório</label
          ><button type="button" @click="variant.parameters.splice(pIndex, 1)">
            Remover parâmetro
          </button>
        </div>
        <button
          type="button"
          @click="
            variant.parameters.push({ name: '', type: 'string', required: true, meaning: '' })
          "
        >
          Adicionar parâmetro ao exemplo</button
        ><button
          v-if="example.variants.length > 1"
          type="button"
          @click="example.variants.splice(index, 1)"
        >
          Remover variante
        </button>
      </fieldset>
      <button
        type="button"
        :disabled="example.variants.length >= 4"
        @click="example.variants.push({ dialect: 'postgres', sql: '', parameters: [] })"
      >
        Adicionar variante SQL
      </button>
    </template>
    <template v-else>
      <button type="button" class="secondary" :disabled="!baseId" @click="emit('loadStructure')">
        Carregar estrutura da versão base
      </button>
      <p v-if="loadedBaseId !== baseId || !proposalContent" class="notice">
        Carregue a versão base para usar tabelas, campos e relacionamentos existentes.
      </p>
      <template v-else>
        <p>
          Edite a definição e selecione o item para envio. Outras alterações no formulário não serão
          incorporadas à proposta. Publicações e rascunhos existentes permanecem preservados.
        </p>
        <StructureEditor
          :model-value="proposalContent"
          :sections="kind === 'tabela' ? ['tables'] : ['relationships']"
          @update:model-value="emit('update:proposalContent', $event)"
        />
        <label
          >Item estrutural da proposta<select
            :value="targetId"
            required
            @change="emit('update:targetId', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Selecione somente uma definição</option>
            <option v-for="item in structuralItems" :key="item.id" :value="item.id">
              {{ item.id }} · {{ item.meaning }}
            </option>
          </select></label
        >
      </template>
    </template>
    <label v-if="physical && (kind === 'tabela' || kind === 'relacionamento')" class="check"
      ><input
        :checked="overrideCommon"
        type="checkbox"
        @change="emit('update:overrideCommon', ($event.target as HTMLInputElement).checked)"
      />Esta proposta substitui explicitamente uma definição comum revisada.</label
    >
    <button type="submit">Enviar proposta de conhecimento</button>
  </form>
</template>
