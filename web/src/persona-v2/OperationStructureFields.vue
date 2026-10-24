<script setup lang="ts">
import { scalarTypes, emptyOperationTable, type OperationTraining } from "./operation-editor";
import OperationNameList from "./OperationNameList.vue";
const training = defineModel<OperationTraining>({ required: true });
</script>
<template>
  <fieldset>
    <legend>Finalidade e limites da operação</legend>
    <label
      >Objetivo da operação<textarea v-model="training.purpose" required maxlength="5000" />
    </label>
    <label
      >Adaptação<select v-model="training.mode">
        <option value="somente_parametros">Somente parâmetros</option>
        <option value="sql_adaptavel">SQL adaptável dentro do contrato</option>
      </select></label
    >
    <label
      >Aprovação de cada lançamento<select v-model="training.approval">
        <option value="human">Humana, pelo responsável</option>
        <option value="automatic">Automática, sujeita às permissões</option>
      </select></label
    >
    <p>
      Publicar a skill não aprova nem executa lançamentos. Conhecimento não concede autorização.
    </p>
    <label
      >Máximo de linhas diretamente afetadas<input
        v-model.number="training.maxAffectedRows"
        type="number"
        min="1"
        max="100000"
        required
    /></label>
    <label
      >Prazo da operação em milissegundos<input
        v-model.number="training.timeoutMs"
        type="number"
        min="1"
        max="300000"
        required
    /></label>
    <label
      >Efeitos indiretos conhecidos<textarea
        v-model="training.indirectEffects"
        required
        maxlength="5000"
      />
    </label>
    <label
      >Procedimento de conciliação<textarea
        v-model="training.reconciliation"
        required
        maxlength="5000"
      />
    </label>
    <label
      >Regras, uma por linha<textarea
        :value="training.rules.join('\n')"
        @input="
          training.rules = ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean)
        "
      />
    </label>
  </fieldset>
  <fieldset>
    <legend>Parâmetros tipados</legend>
    <div v-for="(p, i) in training.parameters" :key="i" class="row">
      <label>Parâmetro<input v-model="p.name" pattern="[a-z_][a-z0-9_]*" required /></label>
      <label
        >Tipo do parâmetro<select v-model="p.type">
          <option v-for="type in scalarTypes" :key="type">{{ type }}</option>
        </select></label
      >
      <label>Significado do parâmetro<input v-model="p.meaning" required /></label>
      <label><input v-model="p.nullable" type="checkbox" />Aceita nulo</label>
      <button type="button" @click="training.parameters.splice(i, 1)">Remover parâmetro</button>
    </div>
    <button
      type="button"
      :disabled="training.parameters.length >= 100"
      @click="training.parameters.push({ name: '', type: 'string', nullable: false, meaning: '' })"
    >
      Adicionar parâmetro de operação
    </button>
  </fieldset>
  <fieldset v-for="(t, index) in training.tables" :key="index">
    <legend>Tabela {{ index + 1 }}</legend>
    <label
      >Nome físico da tabela<input
        v-model="t.name"
        placeholder="schema.tabela"
        pattern="([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*"
        required
    /></label>
    <label>Significado da tabela<input v-model="t.meaning" required /></label>
    <OperationNameList
      v-model="t.identity"
      label="Identidade, campos separados por vírgula"
      required
    />
    <OperationNameList v-model="t.concurrency" label="Concorrência, campos separados por vírgula" />
    <OperationNameList
      :model-value="t.grain ?? []"
      label="Grão, campos separados por vírgula"
      @update:model-value="t.grain = $event.length ? $event : undefined"
    />
    <div v-for="(_key, keyIndex) in t.uniqueKeys ?? []" :key="keyIndex">
      <OperationNameList
        :model-value="t.uniqueKeys![keyIndex]"
        :label="`Chave única ${keyIndex + 1}, campos separados por vírgula`"
        required
        @update:model-value="t.uniqueKeys![keyIndex] = $event"
      />
      <button type="button" @click="t.uniqueKeys?.splice(keyIndex, 1)">Remover chave única</button>
    </div>
    <button
      type="button"
      :disabled="(t.uniqueKeys?.length ?? 0) >= 16"
      @click="
        t.uniqueKeys ??= [];
        t.uniqueKeys.push([]);
      "
    >
      Adicionar chave única
    </button>
    <div v-for="(c, i) in t.columns" :key="i" class="row">
      <label>Coluna<input v-model="c.name" pattern="[a-z_][a-z0-9_]*" required /></label>
      <label
        >Tipo da coluna<select v-model="c.type">
          <option v-for="type in scalarTypes" :key="type">{{ type }}</option>
        </select></label
      >
      <label>Significado da coluna<input v-model="c.meaning" required /></label>
      <label><input v-model="c.writable" type="checkbox" />Permitir escrita</label>
      <p v-if="c.classification && c.classification !== 'livre'">
        Classificação {{ c.classification }}: não habilita operação SQL.
      </p>
      <button type="button" @click="t.columns.splice(i, 1)">Remover coluna</button>
    </div>
    <button
      type="button"
      :disabled="t.columns.length >= 200"
      @click="
        t.columns.push({
          name: '',
          type: 'string',
          writable: false,
          meaning: '',
          classification: 'livre',
        })
      "
    >
      Adicionar coluna de operação
    </button>
    <button type="button" @click="training.tables.splice(index, 1)">
      Remover tabela de operação
    </button>
  </fieldset>
  <button
    type="button"
    :disabled="training.tables.length >= 32"
    @click="training.tables.push(emptyOperationTable())"
  >
    Adicionar tabela de operação
  </button>
  <fieldset>
    <legend>Marcador transacional de conciliação</legend>
    <label
      ><input
        type="checkbox"
        :checked="!!training.reconciliationQuery"
        @change="
          training.reconciliationQuery = ($event.target as HTMLInputElement).checked
            ? { table: '', operationIdColumn: '', appendOnlyGuarantee: '' }
            : undefined
        "
      />Declarar consulta de conciliação</label
    >
    <template v-if="training.reconciliationQuery">
      <label
        >Tabela do marcador<select v-model="training.reconciliationQuery.table" required>
          <option value="">Selecione</option>
          <option v-for="t in training.tables" :key="t.name">{{ t.name }}</option>
        </select></label
      >
      <label
        >Coluna UUID da operação<select
          v-model="training.reconciliationQuery.operationIdColumn"
          required
        >
          <option value="">Selecione</option>
          <option
            v-for="c in training.tables
              .find((t) => t.name === training.reconciliationQuery?.table)
              ?.columns.filter((c) => c.type === 'uuid') ?? []"
            :key="c.name"
          >
            {{ c.name }}
          </option>
        </select></label
      >
      <label
        >Garantia de preservação do marcador<textarea
          v-model="training.reconciliationQuery.appendOnlyGuarantee"
          required
        />
      </label>
      <p>
        Uma etapa INSERT deve gravar a identidade da operação. Ausência de prova mantém resultado
        desconhecido, sem reenvio.
      </p>
    </template>
  </fieldset>
</template>
