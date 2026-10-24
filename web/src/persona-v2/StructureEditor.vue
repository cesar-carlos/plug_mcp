<script setup lang="ts">
import { ref, watch, computed } from "vue";
import RelationshipDiagram from "./RelationshipDiagram.vue";
import { duplicateSqlExamples } from "./training-visual";
import type { z } from "zod";
import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema";
type Content = z.infer<typeof structureContentSchema>;
const props = defineProps<{
  modelValue: unknown;
  sections?: readonly ("tables" | "relationships")[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: Content] }>();
const content = ref<Content>(),
  invalid = ref(false);
const duplicates = computed(() =>
  duplicateSqlExamples(
    content.value?.examples.flatMap((e) =>
      e.variants.map((v) => ({ id: e.id, dialect: v.dialect, sql: v.sql })),
    ) ?? [],
  ),
);
const dialects = [
  { id: "mssql", label: "SQL Server" },
  { id: "sybase", label: "SQL Anywhere" },
  { id: "postgres", label: "PostgreSQL" },
] as const;
watch(
  () => props.modelValue,
  (value) => {
    if (value === content.value) return;
    const parsed = structureContentSchema.safeParse(value);
    content.value = parsed.success ? parsed.data : undefined;
    invalid.value = value !== undefined && !parsed.success;
  },
  { immediate: true },
);
watch(
  content,
  (value) => {
    if (value) emit("update:modelValue", value);
  },
  { deep: true },
);
function start() {
  content.value = {
    system: "",
    label: "",
    dialects: [],
    tables: [],
    relationships: [],
    examples: [],
    rules: [],
  };
}
function list(event: Event) {
  return (event.target as HTMLInputElement).value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
function optionalNumber(event: Event) {
  const input = event.target as HTMLInputElement;
  return input.value === "" ? undefined : input.valueAsNumber;
}
function addTable() {
  content.value?.tables.push({
    id: "",
    name: "",
    meaning: "",
    resourceType: "table",
    grain: [],
    physicalNames: [],
    columns: [],
  });
}
function addRelationship() {
  content.value?.relationships.push({
    id: "",
    from: "",
    to: "",
    keys: [{ from: "", to: "" }],
    join: "inner",
    cardinality: "N:1",
    optional: false,
    meaning: "",
    via: [],
    path: [],
    origin: "business",
  });
}
function changeRelationshipOrigin(relation: Content["relationships"][number], event: Event) {
  relation.origin =
    (event.target as HTMLSelectElement).value === "database" ? "database" : "business";
  if (relation.origin === "business") {
    delete relation.constraintName;
    delete relation.constraintStatus;
  } else {
    relation.constraintStatus ??= "unknown";
  }
}
function addExample() {
  content.value?.examples.push({
    id: "",
    purpose: "",
    explanation: "",
    state: "inactive",
    variants: [],
  });
}
</script>
<template>
  <div class="structure-editor" aria-label="Editor de estrutura">
    <p class="notice">
      Estas definições são declarações de treinamento. A conferência técnica da base e a revisão de
      negócio são etapas distintas.
    </p>
    <p v-if="invalid" role="alert">
      O conteúdo importado não corresponde ao contrato estrutural. Revise o arquivo; ele não foi
      convertido nem executado.
    </p>
    <button v-if="!content && !invalid" type="button" @click="start">
      Criar estrutura pelo formulário
    </button>
    <template v-if="content">
      <template v-if="!sections">
        <label>Sistema<input v-model="content.system" maxlength="200" required /></label>
        <label>Versão do padrão<input v-model="content.label" maxlength="100" required /></label>
        <fieldset>
          <legend>Dialetos declarados</legend>
          <label v-for="d in dialects" :key="d.id" class="check"
            ><input v-model="content.dialects" type="checkbox" :value="d.id" />{{ d.label }}</label
          >
        </fieldset>
      </template>
      <template v-if="!sections || sections.includes('tables')">
        <h3>Tabelas e campos</h3>
        <details v-for="(table, ti) in content.tables" :key="ti" open class="relationship">
          <summary>
            {{ table.name || `Nova tabela ${ti + 1}` }} · {{ table.columns.length }} campos
          </summary>
          <label>Identificador lógico<input v-model="table.id" required /></label>
          <label>Nome da tabela<input v-model="table.name" required /></label>
          <label>Significado da tabela<textarea v-model="table.meaning" required /></label>
          <label
            >Tipo de recurso<select v-model="table.resourceType">
              <option value="table">Tabela</option>
              <option value="view">View</option>
            </select></label
          >
          <label
            >Grão: campos que identificam um registro<input
              :value="table.grain.join(', ')"
              @input="table.grain = list($event)"
          /></label>
          <h4>Nomes físicos por dialeto</h4>
          <div v-for="(physical, pi) in table.physicalNames" :key="pi" class="row">
            <label
              >Dialeto<select v-model="physical.dialect">
                <option v-for="d in dialects" :key="d.id" :value="d.id">{{ d.label }}</option>
              </select></label
            >
            <label>Nome qualificado<input v-model="physical.name" required /></label>
            <button type="button" class="secondary" @click="table.physicalNames.splice(pi, 1)">
              Remover nome físico
            </button>
          </div>
          <button
            type="button"
            class="secondary"
            @click="table.physicalNames.push({ dialect: content.dialects[0] ?? 'mssql', name: '' })"
          >
            Adicionar nome físico
          </button>
          <div v-for="(column, ci) in table.columns" :key="ci" class="relationship">
            <h4>{{ column.name || `Campo ${ci + 1}` }}</h4>
            <label>Nome do campo<input v-model="column.name" required /></label>
            <label>Significado do campo<textarea v-model="column.meaning" required /></label>
            <label>Tipo lógico<input v-model="column.logicalType" required /></label>
            <label class="check"
              ><input v-model="column.nullable" type="checkbox" />Aceita valor nulo</label
            >
            <label
              >Classificação<select v-model="column.classification">
                <option value="livre">Livre</option>
                <option value="sensivel">Sensível</option>
                <option value="pessoal">Pessoal</option>
                <option value="segredo">Segredo</option>
                <option value="inferido">Ainda não revisado</option>
              </select></label
            >
            <label
              >Unidade<input
                :value="column.unit"
                @input="column.unit = ($event.target as HTMLInputElement).value || undefined"
            /></label>
            <label
              >Moeda<input
                :value="column.currency"
                @input="column.currency = ($event.target as HTMLInputElement).value || undefined"
            /></label>
            <label
              >Calendário<input
                :value="column.calendar"
                @input="column.calendar = ($event.target as HTMLInputElement).value || undefined"
            /></label>
            <div v-for="(native, ni) in column.nativeTypes" :key="ni" class="row">
              <label
                >Dialeto<select v-model="native.dialect">
                  <option v-for="d in dialects" :key="d.id" :value="d.id">{{ d.label }}</option>
                </select></label
              >
              <label>Tipo nativo<input v-model="native.type" required /></label>
              <label
                >Precisão<input
                  :value="native.precision"
                  type="number"
                  min="1"
                  @input="native.precision = optionalNumber($event)"
              /></label>
              <label
                >Escala<input
                  :value="native.scale"
                  type="number"
                  min="0"
                  @input="native.scale = optionalNumber($event)"
              /></label>
              <label
                >Comprimento<input
                  :value="native.length"
                  type="number"
                  min="1"
                  @input="native.length = optionalNumber($event)"
              /></label>
              <button type="button" class="secondary" @click="column.nativeTypes?.splice(ni, 1)">
                Remover tipo nativo
              </button>
            </div>
            <button
              type="button"
              class="secondary"
              @click="
                (column.nativeTypes ??= []).push({
                  dialect: content.dialects[0] ?? 'mssql',
                  type: '',
                })
              "
            >
              Adicionar tipo nativo
            </button>
            <button type="button" class="secondary" @click="table.columns.splice(ci, 1)">
              Remover campo
            </button>
          </div>
          <button
            type="button"
            class="secondary"
            @click="
              table.columns.push({
                name: '',
                meaning: '',
                logicalType: '',
                nullable: false,
                classification: 'inferido',
              })
            "
          >
            Adicionar campo
          </button>
          <h4>Chaves declaradas</h4>
          <div v-for="(key, ki) in table.keys" :key="ki" class="row">
            <label>Identificador da chave<input v-model="key.id" required /></label>
            <label
              >Tipo<select v-model="key.kind">
                <option value="primary">Primária</option>
                <option value="unique">Única</option>
              </select></label
            >
            <label
              >Campos ordenados<input
                :value="key.columns.join(', ')"
                @input="key.columns = list($event)"
            /></label>
            <label
              >Estado declarado<select v-model="key.status">
                <option value="unknown">Desconhecido</option>
                <option value="enabled">Habilitada</option>
                <option value="disabled">Desabilitada</option>
                <option value="unvalidated">Não validada</option>
              </select></label
            >
            <button type="button" class="secondary" @click="table.keys?.splice(ki, 1)">
              Remover chave
            </button>
          </div>
          <button
            type="button"
            class="secondary"
            @click="
              (table.keys ??= []).push({ id: '', kind: 'primary', columns: [], status: 'unknown' })
            "
          >
            Adicionar chave
          </button>
          <button type="button" class="secondary" @click="content.tables.splice(ti, 1)">
            Remover tabela do rascunho
          </button>
        </details>
        <button type="button" @click="addTable">Adicionar tabela ao padrão</button>
      </template>
      <template v-if="!sections || sections.includes('relationships')">
        <h3>Relacionamentos</h3>
        <div v-for="(r, ri) in content.relationships" :key="ri" class="relationship">
          <label>Identificador do relacionamento<input v-model="r.id" required /></label>
          <label
            >Origem<select v-model="r.from">
              <option value="">Selecione</option>
              <option v-for="t in content.tables" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select></label
          >
          <label
            >Destino<select v-model="r.to">
              <option value="">Selecione</option>
              <option v-for="t in content.tables" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select></label
          >
          <label
            >Cardinalidade<select v-model="r.cardinality">
              <option>1:1</option>
              <option>1:N</option>
              <option>N:1</option>
              <option>N:N</option>
            </select></label
          >
          <label
            >Combinação<select v-model="r.join">
              <option value="inner">Somente correspondências</option>
              <option value="left">Preservar origem sem correspondência</option>
            </select></label
          >
          <label class="check"
            ><input v-model="r.optional" type="checkbox" />Relacionamento opcional</label
          >
          <label>Significado do relacionamento<textarea v-model="r.meaning" required /></label>
          <label
            >Origem da declaração<select
              :value="r.origin ?? 'business'"
              @change="changeRelationshipOrigin(r, $event)"
            >
              <option value="business">Negócio, exige revisão</option>
              <option value="database">Restrição declarada no banco, exige conferência</option>
            </select></label
          >
          <template v-if="r.origin === 'database'">
            <label
              >Nome declarado da constraint<input
                :value="r.constraintName"
                @input="r.constraintName = ($event.target as HTMLInputElement).value || undefined"
            /></label>
            <label
              >Estado declarado da constraint<select v-model="r.constraintStatus">
                <option value="unknown">Desconhecido</option>
                <option value="enabled">Habilitada</option>
                <option value="disabled">Desabilitada</option>
                <option value="unvalidated">Não validada</option>
              </select></label
            >
            <p>
              Declaração de treinamento. Somente inspeção autorizada pode comprovar o estado físico.
            </p>
          </template>
          <div v-for="(pair, pi) in r.keys" :key="pi" class="row">
            <label
              >Campo de origem<select v-model="pair.from">
                <option value="">Selecione</option>
                <option
                  v-for="c in content.tables.find((t) => t.id === r.from)?.columns ?? []"
                  :key="c.name"
                >
                  {{ c.name }}
                </option>
              </select></label
            >
            <label
              >Campo de destino<select v-model="pair.to">
                <option value="">Selecione</option>
                <option
                  v-for="c in content.tables.find((t) => t.id === r.to)?.columns ?? []"
                  :key="c.name"
                >
                  {{ c.name }}
                </option>
              </select></label
            >
            <button type="button" class="secondary" @click="r.keys.splice(pi, 1)">
              Remover par
            </button>
          </div>
          <button type="button" class="secondary" @click="r.keys.push({ from: '', to: '' })">
            Adicionar par de chave
          </button>
          <label
            >Tabelas intermediárias (IDs na ordem)<input
              :value="r.via.join(', ')"
              @input="r.via = list($event)"
          /></label>
          <label
            >Caminho N:N (IDs das relações diretas na ordem)<input
              :value="r.path?.join(', ')"
              @input="r.path = list($event)"
          /></label>
          <button type="button" class="secondary" @click="content.relationships.splice(ri, 1)">
            Remover relacionamento
          </button>
        </div>
        <button type="button" @click="addRelationship">Adicionar relacionamento ao padrão</button>
        <RelationshipDiagram :tables="content.tables" :relationships="content.relationships" />
      </template>
      <template v-if="!sections">
        <h3>Biblioteca SQL</h3>
        <p v-for="pair in duplicates" :key="pair.join(':')" class="notice">
          Possível duplicação entre {{ pair[0] }} e {{ pair[1] }} no mesmo dialeto. Revise antes de
          consolidar.
        </p>
        <div v-for="(example, ei) in content.examples" :key="ei" class="relationship">
          <label>Identificador do exemplo<input v-model="example.id" required /></label>
          <label>Finalidade do exemplo<textarea v-model="example.purpose" required /></label>
          <label>Explicação<textarea v-model="example.explanation" required /></label>
          <label
            >Estado editorial<select v-model="example.state">
              <option value="candidate">Candidato — exige revisão</option>
              <option value="inactive">Inativo</option>
              <option value="approved">Revisado para publicação</option>
              <option value="replaced">Substituído</option>
            </select></label
          >
          <div v-for="(variant, vi) in example.variants" :key="vi" class="relationship">
            <label
              >Dialeto<select v-model="variant.dialect">
                <option v-for="d in dialects" :key="d.id" :value="d.id">{{ d.label }}</option>
              </select></label
            >
            <label
              >SQL do exemplo<textarea
                v-model="variant.sql"
                class="sql"
                required
                spellcheck="false"
              />
            </label>
            <div v-for="(parameter, pi) in variant.parameters" :key="pi" class="row">
              <label>Parâmetro<input v-model="parameter.name" required /></label>
              <label>Significado<input v-model="parameter.meaning" required /></label>
              <label
                >Tipo<select v-model="parameter.type">
                  <option
                    v-for="type in [
                      'string',
                      'number',
                      'integer',
                      'decimal',
                      'boolean',
                      'date',
                      'datetime',
                    ]"
                    :key="type"
                  >
                    {{ type }}
                  </option>
                </select></label
              >
              <label class="check"
                ><input v-model="parameter.required" type="checkbox" />Obrigatório</label
              >
              <button type="button" class="secondary" @click="variant.parameters.splice(pi, 1)">
                Remover parâmetro
              </button>
            </div>
            <button
              type="button"
              class="secondary"
              @click="
                variant.parameters.push({ name: '', meaning: '', type: 'string', required: true })
              "
            >
              Adicionar parâmetro ao exemplo
            </button>
            <button type="button" class="secondary" @click="example.variants.splice(vi, 1)">
              Remover variante
            </button>
          </div>
          <button
            type="button"
            class="secondary"
            @click="
              example.variants.push({
                dialect: content.dialects[0] ?? 'mssql',
                sql: '',
                parameters: [],
              })
            "
          >
            Adicionar variante SQL
          </button>
          <button type="button" class="secondary" @click="content.examples.splice(ei, 1)">
            Remover exemplo
          </button>
        </div>
        <button type="button" @click="addExample">Adicionar exemplo ao padrão</button>
        <label
          >Regras de negócio (uma por linha)<textarea
            :value="content.rules.join('\n')"
            @input="
              content.rules = ($event.target as HTMLTextAreaElement).value
                .split('\n')
                .filter((v) => v.trim())
            "
          />
        </label>
        <details>
          <summary>Resumo dos relacionamentos</summary>
          <ul>
            <li v-for="r in content.relationships" :key="r.id">
              {{ content.tables.find((t) => t.id === r.from)?.name }} →
              {{ content.tables.find((t) => t.id === r.to)?.name }} · {{ r.cardinality }} ·
              {{ r.meaning }}<span v-if="r.via.length"> · via {{ r.via.join(" → ") }}</span>
            </li>
          </ul>
        </details>
      </template>
    </template>
  </div>
</template>
