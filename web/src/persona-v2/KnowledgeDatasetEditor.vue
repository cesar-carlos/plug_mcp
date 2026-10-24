<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import { datasetLogicalType } from "../../../src/application/persona-v2/dataset-types";
import { useErrorSummary } from "./useErrorSummary";

interface Cell {
  text: string;
  isNull: boolean;
}
interface TableEdit {
  id: string;
  columns: string[];
  rows: Record<string, Cell>[];
}
const props = defineProps<{
  template: { id: string; version: number; hash: string; name: string; content: StructureContent };
  disabled: boolean;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  create: [{ slug: string; name: string; payload: Extract<LibraryPayload, { kind: "dataset" }> }];
}>();
const slug = ref(""),
  name = ref(""),
  description = ref(""),
  authorizationRef = ref("");
const provenance = ref<"synthetic" | "authorized">("synthetic");
const chosenTable = ref("");
const tables = ref<TableEdit[]>([]);
const { error, errorSummary } = useErrorSummary();
const eligible = computed(() =>
  props.template.content.tables
    .map((table) => ({
      ...table,
      columns: table.columns.filter(
        (c) => c.classification === "livre" && datasetLogicalType(c.logicalType),
      ),
    }))
    .filter((t) => t.columns.length),
);
const remaining = computed(() =>
  eligible.value.filter((t) => !tables.value.some((e) => e.id === t.id)),
);
const dirty = computed(
  () =>
    !!(
      slug.value ||
      name.value ||
      description.value ||
      authorizationRef.value ||
      provenance.value !== "synthetic" ||
      chosenTable.value ||
      tables.value.length
    ),
);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
onBeforeUnmount(() => emit("dirty", false));
const rowCount = computed(() => tables.value.reduce((sum, t) => sum + t.rows.length, 0));
const cellCount = computed(() =>
  tables.value.reduce((sum, t) => sum + t.rows.length * t.columns.length, 0),
);
function fields(table: TableEdit) {
  return eligible.value.find((t) => t.id === table.id)?.columns ?? [];
}
function addTable() {
  if (props.disabled || !remaining.value.some((t) => t.id === chosenTable.value)) {
    return;
  }
  tables.value.push({ id: chosenTable.value, columns: [], rows: [] });
  chosenTable.value = "";
}
function addRow(table: TableEdit) {
  if (props.disabled || rowCount.value >= 1000 || cellCount.value + table.columns.length > 20000) {
    return;
  }
  table.rows.push(
    Object.fromEntries(fields(table).map((c) => [c.name, { text: "", isNull: false }])),
  );
}
function reset() {
  slug.value = "";
  name.value = "";
  description.value = "";
  authorizationRef.value = "";
  provenance.value = "synthetic";
  chosenTable.value = "";
  tables.value = [];
  error.value = "";
}
function value(cell: Cell, type: string): string | number | boolean | null {
  if (cell.isNull) {
    return null;
  }
  if (type === "boolean") {
    if (cell.text !== "true" && cell.text !== "false") {
      throw new Error("Escolha verdadeiro ou falso.");
    }
    return cell.text === "true";
  }
  if (type === "integer" || type === "number") {
    const syntax = type === "integer" ? /^-?\d+$/ : /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
    const number = Number(cell.text);
    if (
      !syntax.test(cell.text) ||
      !Number.isFinite(number) ||
      (type === "integer" && !Number.isSafeInteger(number))
    ) {
      throw new Error("Informe um número válido; inteiros devem ter precisão segura.");
    }
    return number;
  }
  // Decimal, date and text remain strings. Empty text is never converted to zero or null.
  return cell.text;
}
function submit() {
  if (props.disabled) {
    return;
  }
  error.value = "";
  try {
    if (!tables.value.length || tables.value.some((t) => !t.columns.length)) {
      throw new Error("Adicione uma tabela e selecione ao menos um campo em cada tabela.");
    }
    const payload: Extract<LibraryPayload, { kind: "dataset" }> = {
      kind: "dataset",
      templateId: props.template.id,
      templateVersion: props.template.version,
      templateHash: props.template.hash,
      provenance:
        provenance.value === "synthetic"
          ? { kind: "synthetic", description: description.value }
          : {
              kind: "authorized",
              description: description.value,
              authorizationRef: authorizationRef.value,
            },
      tables: tables.value.map((table) => {
        const columns = fields(table)
          .filter((c) => table.columns.includes(c.name))
          .map((c) => ({
            name: c.name,
            type: datasetLogicalType(c.logicalType)!,
          }));
        return {
          tableId: table.id,
          columns,
          rows: table.rows.map((row, index) =>
            columns.map((col) => {
              try {
                return value(row[col.name], col.type);
              } catch (cause) {
                throw new Error(
                  `Tabela ${table.id}, linha ${index + 1}, campo ${col.name}: ${cause instanceof Error ? cause.message : "Valor inválido."}`,
                  { cause },
                );
              }
            }),
          ),
        };
      }),
    };
    emit("create", { slug: slug.value, name: name.value, payload });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Confira os valores do dataset.";
  }
}
</script>
<template>
  <details>
    <summary>Criar dataset com formulário</summary>
    <form aria-label="Criar dataset do template" @submit.prevent="submit">
      <p>
        {{ template.name }} · versão {{ template.version }}. A referência é fixa; atualizar o
        template não altera este material.
      </p>
      <p>
        Somente campos livres com tipo lógico reconhecido. Nenhuma consulta será executada. A
        validação definitiva ocorre no servidor.
      </p>
      <p v-if="error" ref="errorSummary" role="alert" class="error" tabindex="-1">{{ error }}</p>
      <fieldset :disabled="disabled">
        <label
          >Identificador do dataset<input
            v-model="slug"
            required
            maxlength="100"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
        /></label>
        <label>Nome do dataset<input v-model="name" required maxlength="200" /></label>
        <label
          >Origem do material<select v-model="provenance">
            <option value="synthetic">Dados sintéticos</option>
            <option value="authorized">Material explicitamente autorizado</option>
          </select></label
        >
        <label
          >Descrição da proveniência<textarea v-model="description" required maxlength="2000" />
        </label>
        <label v-if="provenance === 'authorized'"
          >Referência da autorização<input v-model="authorizationRef" required maxlength="2000"
        /></label>
        <label
          >Tabela do template<select v-model="chosenTable">
            <option value="">Selecione</option>
            <option v-for="table in remaining" :key="table.id" :value="table.id">
              {{ table.name }}
            </option>
          </select></label
        >
        <button type="button" :disabled="!chosenTable" @click="addTable">
          Adicionar tabela ao dataset
        </button>
        <p v-if="!eligible.length">
          O template não possui campos livres com tipos lógicos reconhecidos. Revise o template
          antes de criar um dataset.
        </p>
        <fieldset v-for="table in tables" :key="table.id">
          <legend>{{ eligible.find((t) => t.id === table.id)?.name }}</legend>
          <p>
            Escolha os campos. Desmarcar preserva a edição em memória, mas exclui o campo do envio.
          </p>
          <label v-for="field in fields(table)" :key="field.name"
            ><input v-model="table.columns" type="checkbox" :value="field.name" />{{ field.name }} ·
            {{ field.logicalType }}</label
          >
          <fieldset v-for="(row, index) in table.rows" :key="index">
            <legend>Linha {{ index + 1 }}</legend>
            <template
              v-for="field in fields(table).filter((c) => table.columns.includes(c.name))"
              :key="field.name"
            >
              <label v-if="datasetLogicalType(field.logicalType) === 'boolean'"
                >{{ field.name
                }}<select
                  v-model="row[field.name]!.text"
                  :aria-label="field.name"
                  :disabled="row[field.name]!.isNull"
                >
                  <option value="">Selecione</option>
                  <option value="true">Verdadeiro</option>
                  <option value="false">Falso</option>
                </select></label
              >
              <label v-else
                >{{ field.name
                }}<input
                  v-model="row[field.name]!.text"
                  :disabled="row[field.name]!.isNull"
                  maxlength="2000"
                  :inputmode="
                    ['integer', 'number', 'decimal'].includes(
                      datasetLogicalType(field.logicalType)!,
                    )
                      ? 'decimal'
                      : 'text'
                  "
              /></label>
              <label v-if="field.nullable"
                ><input v-model="row[field.name]!.isNull" type="checkbox" />{{ field.name }}: valor
                nulo</label
              >
            </template>
            <button type="button" @click="table.rows.splice(index, 1)">
              Remover linha {{ index + 1 }}
            </button>
          </fieldset>
          <button
            type="button"
            :disabled="
              !table.columns.length || rowCount >= 1000 || cellCount + table.columns.length > 20000
            "
            @click="addRow(table)"
          >
            Adicionar linha
          </button>
          <button type="button" @click="tables.splice(tables.indexOf(table), 1)">
            Remover tabela do dataset
          </button>
        </fieldset>
        <p>
          {{ rowCount }} linhas · {{ cellCount }} células. Limites: 1.000 linhas, 20.000 células e
          50 KiB.
        </p>
        <button :disabled="!tables.length">Salvar dataset editorial</button>
        <button type="button" @click="reset">Limpar edição do dataset</button>
      </fieldset>
    </form>
  </details>
</template>
<style scoped>
form,
fieldset,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
input,
textarea,
select,
button {
  max-width: 100%;
  box-sizing: border-box;
}
</style>
