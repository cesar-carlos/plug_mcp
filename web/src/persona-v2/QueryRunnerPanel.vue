<script setup lang="ts">
import type { AttachmentDescriptor } from "../../../src/domain/persona-v2/attachments";
import { RouterLink } from "vue-router";
import { displayCell } from "./console-display";
import type { Publication, QueryResult, Source } from "./model";
import type { ParameterMode } from "./query-parameters";

const props = defineProps<{
  busy: boolean;
  publications: Record<string, Publication>;
  sources: Source[];
  active?: Publication;
  grantedQueries?: { id: string; name: string; publicationId: string; hash: string }[];
  queryPage: number;
  submittedFilters: Record<string, unknown>;
  result?: QueryResult;
  attachment?: AttachmentDescriptor;
}>();
const bearer = defineModel<string>("bearer", { required: true });
const querySkill = defineModel<string>("querySkill", { required: true });
const querySql = defineModel<string>("querySql", { required: true });
const queryValues = defineModel<Record<string, string>>("queryValues", { required: true });
const queryModes = defineModel<Record<string, ParameterMode>>("queryModes", { required: true });
const queryPageSize = defineModel<number>("queryPageSize", { required: true });
const emit = defineEmits<{
  inspect: [];
  query: [validation: boolean, page?: number];
  createAttachment: [format: "json" | "binary"];
  downloadAttachment: [];
}>();

function sourceName(sourceId: string | undefined): string | undefined {
  return props.sources.find((source) => source.id === sourceId)?.name;
}
</script>
<template>
  <section>
    <p v-if="!bearer" class="notice">
      Para consultar, informe um token com permissão para uma skill publicada.
      <RouterLink :to="{ name: 'tokens' }">Configurar acesso às consultas</RouterLink>.
    </p>
    <h2>Consultar dados publicados</h2>
    <label
      >Token para consultar<input
        v-model="bearer"
        type="password"
        autocomplete="off"
        :disabled="busy"
    /></label>
    <button class="secondary" :disabled="busy || !bearer" @click="emit('inspect')">
      Ver consultas permitidas por este token
    </button>
    <p v-if="grantedQueries && !Object.keys(publications).length">
      Nenhuma consulta desta persona foi concedida ao token.
    </p>
    <fieldset :disabled="busy">
      <label
        >Consulta<select v-model="querySkill">
          <option value="">Selecione</option>
          <option v-for="(publication, id) in publications" :key="id" :value="String(id)">
            {{ `${publication.package.name} · revisão ${publication.revision}` }}
          </option>
        </select></label
      ><template v-if="active"
        ><p>Fonte: {{ sourceName(active.package.sourceId) }}</p>
        <div v-for="parameter in active.package.training.parameters" :key="parameter.name">
          <label
            >{{ parameter.meaning }} ({{ parameter.name }}) ·
            {{ parameter.required ? "Obrigatório" : "Opcional"
            }}<select
              v-if="parameter.type === 'boolean'"
              v-model="queryValues[parameter.name]"
              :disabled="queryModes[parameter.name] && queryModes[parameter.name] !== 'value'"
            >
              <option value="">Escolha</option>
              <option value="true">Sim</option>
              <option value="false">Não</option></select
            ><input
              v-else
              v-model="queryValues[parameter.name]"
              :disabled="queryModes[parameter.name] && queryModes[parameter.name] !== 'value'"
          /></label>
          <label :for="`mode-${parameter.name}`">Como enviar {{ parameter.name }}</label
          ><select
            :id="`mode-${parameter.name}`"
            :value="queryModes[parameter.name] ?? 'value'"
            @change="
              queryModes[parameter.name] = ($event.target as HTMLSelectElement)
                .value as ParameterMode
            "
          >
            <option value="value">Valor informado</option>
            <option v-if="parameter.type === 'string'" value="empty">Texto vazio</option>
            <option v-if="!parameter.required" value="null">Nulo explícito</option>
            <option v-if="!parameter.required" value="omit">Omitir parâmetro</option>
          </select>
        </div>
        <label
          >SQL adaptado (opcional; vazio usa o exemplo publicado)<textarea
            v-model="querySql"
            class="sql"
            spellcheck="false"
          /></label
        ><label
          >Linhas por página<select v-model.number="queryPageSize">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select></label
        >
        <button :disabled="!bearer" @click="emit('query', true)">Validar SQL</button
        ><button :disabled="!bearer" @click="emit('query', false)">Consultar</button>
        <button
          v-if="active.package.training.attachments"
          :disabled="!bearer || busy"
          @click="emit('createAttachment', 'json')"
        >
          Criar anexo JSON
        </button>
        <p v-if="active.package.training.attachments">
          Criar anexo executa uma nova consulta, com os filtros e a página escolhidos. Exige
          exportação concedida para todos os campos retornados.
        </p>
        <button
          v-if="active.package.training.binaryAttachments"
          :disabled="!bearer || busy"
          @click="emit('createAttachment', 'binary')"
        >
          Criar anexo binário
        </button>
        <p v-if="active.package.training.binaryAttachments">
          Selecione um único registro pelos filtros. Binários não usam paginação e não são mostrados
          na tabela de consulta.
        </p></template
      >
    </fieldset>
    <section v-if="attachment" aria-label="Anexo da consulta">
      <h3>{{ attachment.format === "binary" ? "Anexo binário" : "Anexo JSON" }}</h3>
      <p>{{ attachment.mimeType }}</p>
      <p>
        {{ attachment.rows }} registros · {{ attachment.bytes }} bytes · leitura em
        {{ new Date(attachment.readAt).toLocaleString() }}
      </p>
      <p :class="attachment.complete ? 'success' : 'notice'">
        {{
          attachment.complete
            ? "Completo para esta consulta."
            : "Parcial: o arquivo não representa o total."
        }}
      </p>
      <p>
        Disponível até {{ new Date(attachment.expiresAt).toLocaleString() }}. O download revalida o
        acesso.
      </p>
      <button :disabled="busy || !bearer" @click="emit('downloadAttachment')">
        {{ attachment.format === "binary" ? "Baixar anexo binário" : "Baixar anexo JSON" }}
      </button>
    </section>
    <div v-if="result">
      <p :class="result.completeness.complete ? 'success' : 'notice'">
        {{
          result.completeness.complete
            ? "Resultado completo para esta consulta."
            : "Resultado parcial: não utilize estas linhas como total."
        }}
      </p>
      <p>
        Fonte: {{ sourceName(result.provenance.sourceId) }} · Leitura:
        {{ new Date(result.provenance.readAt).toLocaleString() }}
      </p>
      <p v-if="result.reuse && result.reuse.kind !== 'fresh'" class="notice">
        Leitura reutilizada, com permissões conferidas novamente. O horário acima é o da consulta
        original; os dados podem ter mudado desde então.
      </p>
      <p v-if="!result.rows.length">Nenhum registro retornado para os filtros desta consulta.</p>
      <p>
        Publicação: {{ active?.package.name }} · revisão {{ active?.revision }} · Dialeto:
        {{ result.provenance.dialect }}
      </p>
      <details>
        <summary>Filtros utilizados e identificação da publicação</summary>
        <pre>{{
          JSON.stringify(
            { filtros: submittedFilters, publicacoes: result.provenance.publications },
            null,
            2,
          )
        }}</pre>
      </details>
      <p v-if="result.limits">
        Limites desta execução: {{ result.limits.maxRows }} linhas, {{ result.limits.pageSize }} por
        página, {{ result.limits.maxBytes }} bytes e {{ result.limits.timeoutMs }} ms.
      </p>
      <div v-if="result.pagination" class="pagination">
        <button
          class="secondary"
          :disabled="busy || queryPage <= 1"
          @click="emit('query', false, queryPage - 1)"
        >
          Página anterior
        </button>
        <span
          >Página {{ result.pagination.page }} · {{ result.rows.length }} registros nesta
          página</span
        >
        <button
          class="secondary"
          :disabled="busy || !result.pagination.hasNextPage"
          @click="emit('query', false, queryPage + 1)"
        >
          Próxima página
        </button>
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th v-for="column in result.columns" :key="column" scope="col">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in result.rows" :key="i">
              <td v-for="column in result.columns" :key="column">{{ displayCell(row[column]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
