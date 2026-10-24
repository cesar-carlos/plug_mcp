<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import type { FederationPackage } from "../../../src/domain/persona-v2/catalog";
import type {
  FederationBudget,
  FederationPlan,
  FederationResult,
} from "../../../src/domain/persona-v2/federation";
import { queryParameters, type ParameterMode } from "./query-parameters";
import type { Source, Training } from "./model";
interface Skill {
  id: string;
  slug: string;
  name: string;
  kind: string;
  publicationId: string;
  hash: string;
}
interface Context extends Pick<
  FederationPackage,
  "name" | "purpose" | "steps" | "output" | "budget"
> {
  publicationId: string;
  hash: string;
  executionBudget: FederationBudget;
  training: { semantics: Record<string, string> };
  dependencies: { publicationId: string; hash: string; skillId: string; sourceId: string }[];
}
interface LocalInput {
  id: string;
  sourceId: string;
  publicationId: string;
  name: string;
  sql: string;
  parameters: Training["parameters"];
  values: Record<string, string>;
  modes: Record<string, ParameterMode>;
}
const props = defineProps<{
  personaId: string;
  bearer: string;
  sources: Source[];
  disabled: boolean;
  mcp: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ lock: [value: boolean]; dirty: [value: boolean] }>();
const skills = ref<Skill[]>(),
  selected = ref("");
const context = ref<Context>(),
  inputs = reactive<LocalInput[]>([]);
const result = ref<
  FederationResult & { publicationId: string; hash: string; page: number; pageSize: number }
>();
const pageSize = ref(100),
  validated = ref(false),
  error = ref("");
const submitted = ref<FederationPlan>(),
  errorSummary = ref<HTMLElement>();
const initial = ref(""),
  busy = ref(false);
const fingerprint = computed(() => JSON.stringify(inputs));
const dirty = computed(() => !!context.value && fingerprint.value !== initial.value);
const sourceName = (id: string) => props.sources.find((source) => source.id === id)?.name ?? id;
const semantics: Record<string, string> = {
  matching: "Correspondência",
  normalization: "Normalização",
  missing: "Ausência",
  duplicates: "Duplicidades",
  units: "Unidades",
  currency: "Moeda",
  calendar: "Calendário",
};
let live = true,
  generation = 0;
onBeforeUnmount(() => {
  live = false;
  generation++;
  emit("dirty", false);
});
watch(dirty, (value) => emit("dirty", value), { immediate: true });
watch([fingerprint, pageSize], () => {
  result.value = undefined;
  submitted.value = undefined;
  validated.value = false;
});
watch(
  () => props.bearer,
  () => {
    generation++;
    skills.value = undefined;
    result.value = undefined;
    submitted.value = undefined;
    validated.value = false;
    error.value = "";
  },
);
function clear() {
  context.value = undefined;
  inputs.splice(0);
  initial.value = "";
  result.value = undefined;
  submitted.value = undefined;
  validated.value = false;
}
async function run(action: (current: () => boolean) => Promise<void>) {
  if (busy.value || props.disabled) return;
  const version = ++generation;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  result.value = undefined;
  validated.value = false;
  const current = () => live && version === generation;
  try {
    await action(current);
  } catch (cause) {
    if (current()) {
      error.value = cause instanceof Error ? cause.message : "Cruzamento indisponível.";
      await nextTick();
      errorSummary.value?.focus();
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function permitted() {
  const persona = await props.mcp<{ id: string }>("obter_contexto_persona", {});
  if (persona.id !== props.personaId) throw new Error("Este token pertence a outra persona.");
  return props.mcp<Skill[]>("listar_skills", {});
}
async function discover() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  await run(async (current) => {
    const list = await permitted();
    if (!current()) return;
    clear();
    selected.value = "";
    skills.value = list.filter((skill) => skill.kind === "cruzamento");
  });
}
async function choose(event: Event) {
  const element = event.target as HTMLSelectElement,
    next = element.value;
  if (dirty.value && !(await props.confirmDiscard())) {
    element.value = selected.value;
    return;
  }
  await run(async (current) => {
    clear();
    selected.value = next;
    if (!next) return;
    const skill = skills.value?.find((item) => item.id === next);
    if (!skill) throw new Error("Selecione um cruzamento concedido.");
    const published = await props.mcp<Context>("obter_skill", { slug: skill.slug });
    if (!current()) return;
    if (published.publicationId !== skill.publicationId || published.hash !== skill.hash)
      throw new Error("A publicação mudou. Atualize os cruzamentos permitidos.");
    const permittedSkills = await permitted();
    const locals: LocalInput[] = [];
    for (const step of published.steps) {
      if (step.kind !== "local") continue;
      const dependency = published.dependencies.find(
        (item) => item.publicationId === step.publicationId && item.sourceId === step.sourceId,
      );
      const summary = permittedSkills.find(
        (item) =>
          item.id === dependency?.skillId &&
          item.publicationId === dependency?.publicationId &&
          item.hash === dependency?.hash,
      );
      if (!dependency || !summary)
        throw new Error("Uma consulta dependente não está concedida ou mudou.");
      const query = await props.mcp<{
        publicationId: string;
        hash: string;
        sourceId: string;
        sqlModel: string;
        parameters: Training["parameters"];
      }>("obter_skill", { slug: summary.slug });
      if (!current()) return;
      if (
        query.publicationId !== dependency.publicationId ||
        query.hash !== dependency.hash ||
        query.sourceId !== dependency.sourceId
      )
        throw new Error("Uma consulta dependente mudou. Atualize os cruzamentos permitidos.");
      locals.push({
        id: step.id,
        sourceId: step.sourceId,
        publicationId: step.publicationId,
        name: summary.name,
        sql: query.sqlModel,
        parameters: query.parameters,
        values: {},
        modes: {},
      });
    }
    if (!current()) return;
    inputs.push(...locals);
    context.value = published;
    initial.value = fingerprint.value;
  });
}
async function execute(validation: boolean, page = 1) {
  await run(async (current) => {
    submitted.value = undefined;
    const pkg = context.value;
    if (!pkg) throw new Error("Selecione um cruzamento concedido.");
    const allowed = await permitted();
    if (!current()) return;
    if (
      !allowed.some(
        (item) =>
          item.id === selected.value &&
          item.publicationId === pkg.publicationId &&
          item.hash === pkg.hash,
      )
    )
      throw new Error("A publicação ou suas dependências não estão mais concedidas ao token.");
    const plan: FederationPlan = {
      publicationId: pkg.publicationId,
      output: pkg.output,
      page,
      pageSize: pageSize.value,
      steps: pkg.steps.map((step) => {
        if (step.kind !== "local") return step;
        const input = inputs.find((item) => item.id === step.id)!;
        return {
          kind: "local",
          id: step.id,
          sourceId: step.sourceId,
          publicationId: step.publicationId,
          sql: input.sql,
          params: queryParameters(input.parameters, input.values, input.modes),
        };
      }),
    };
    const response = await props.mcp<NonNullable<typeof result.value> & { valid?: boolean }>(
      validation ? "validar_cruzamento" : "executar_cruzamento",
      { plan },
    );
    if (!current()) return;
    if (validation) {
      if (response.valid !== true) throw new Error("O servidor não confirmou a validação.");
      validated.value = true;
    } else {
      if (response.complete !== true)
        throw new Error(
          "As entradas não estão completas. Não é possível apresentar um cruzamento completo.",
        );
      submitted.value = plan;
      result.value = response;
    }
  });
}
</script>

<template>
  <section aria-label="Cruzamentos publicados">
    <h3>Cruzar bases</h3>
    <p>
      Use o token informado acima. As combinações, fontes e relacionamentos vêm da publicação;
      adapte somente o SQL autorizado de cada etapa.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" class="error" tabindex="-1">{{ error }}</p>
    <button
      type="button"
      class="secondary"
      :disabled="disabled || busy || !bearer"
      @click="discover"
    >
      Ver cruzamentos permitidos por este token
    </button>
    <p v-if="skills && !skills.length">
      Nenhum cruzamento publicado foi concedido a este token com todas as suas dependências.
    </p>
    <fieldset v-if="skills?.length" :disabled="disabled || busy">
      <label
        >Cruzamento<select :value="selected" @change="choose">
          <option value="">Selecione</option>
          <option v-for="skill in skills" :key="skill.id" :value="skill.id">
            {{ skill.name }}
          </option>
        </select></label
      >
    </fieldset>
    <template v-if="context">
      <p>{{ context.purpose }}</p>
      <dl>
        <template v-for="(label, key) in semantics" :key="key"
          ><dt>{{ label }}</dt>
          <dd>{{ context.training.semantics[key] }}</dd></template
        >
      </dl>
      <details>
        <summary>Combinação publicada e limites</summary>
        <ol>
          <li v-for="step in context.steps" :key="step.id">
            Etapa {{ step.id }} ·
            {{ step.kind === "local" ? `Consulta em ${sourceName(step.sourceId)}` : step.kind }}
            <pre v-if="step.kind !== 'local'">{{ JSON.stringify(step, null, 2) }}</pre>
          </li>
        </ol>
        <p>
          Até {{ context.executionBudget.sources }} bases e
          {{ context.executionBudget.steps }} etapas;
          {{ context.executionBudget.rowsPerSource }} linhas por base;
          {{ context.executionBudget.intermediateRows }} linhas intermediárias;
          {{ context.executionBudget.intermediateBytes }} bytes;
          {{ context.executionBudget.timeoutMs / 1000 }} segundos. Paginação somente após combinar.
        </p>
      </details>
      <fieldset :disabled="disabled || busy">
        <div v-for="input in inputs" :key="input.id">
          <h4>{{ input.name }} · {{ sourceName(input.sourceId) }}</h4>
          <label
            >SQL da etapa {{ input.id
            }}<textarea v-model="input.sql" class="sql" spellcheck="false" maxlength="30000" />
          </label>
          <div v-for="parameter in input.parameters" :key="parameter.name">
            <label
              >{{ parameter.meaning }} ({{ input.id }}.{{ parameter.name }})<select
                v-if="parameter.type === 'boolean'"
                v-model="input.values[parameter.name]"
                :disabled="!!input.modes[parameter.name] && input.modes[parameter.name] !== 'value'"
              >
                <option value="">Escolha</option>
                <option value="true">Sim</option>
                <option value="false">Não</option></select
              ><input
                v-else
                v-model="input.values[parameter.name]"
                :disabled="
                  !!input.modes[parameter.name] && input.modes[parameter.name] !== 'value'
                "
            /></label>
            <label
              >Como enviar {{ input.id }}.{{ parameter.name
              }}<select v-model="input.modes[parameter.name]">
                <option :value="undefined">Valor informado</option>
                <option v-if="parameter.type === 'string'" value="empty">Texto vazio</option>
                <option v-if="!parameter.required" value="null">Nulo explícito</option>
                <option v-if="!parameter.required" value="omit">Omitir parâmetro</option>
              </select></label
            >
          </div>
        </div>
        <label
          >Linhas por página do cruzamento<select v-model.number="pageSize">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select></label
        >
        <button type="button" :disabled="!bearer" @click="execute(true)">Validar cruzamento</button>
        <button type="button" :disabled="!bearer" @click="execute(false)">
          Consultar cruzamento
        </button>
      </fieldset>
      <p v-if="validated" class="success" role="status">
        Plano e SQL validados tecnicamente. Isso não aprova o significado do treinamento.
      </p>
    </template>
    <div v-if="result">
      <p class="success" role="status">
        Cruzamento completo · {{ result.totalRows }} registros na combinação · Página
        {{ result.page }}
      </p>
      <p>
        Publicação: {{ context?.name }}. As leituras das bases ocorreram em momentos próprios; não
        há uma transação distribuída.
      </p>
      <ul>
        <li v-for="origin in result.provenance" :key="`${origin.sourceId}:${origin.publicationId}`">
          {{ sourceName(origin.sourceId) }} · Leitura:
          {{ new Date(origin.readAt).toLocaleString() }}
          <details>
            <summary>Publicação de origem</summary>
            {{ origin.publicationId }} · {{ origin.publicationHash }}
          </details>
        </li>
      </ul>
      <details>
        <summary>SQL e filtros utilizados no cruzamento</summary>
        <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
      </details>
      <p v-if="!result.rows.length">Nenhum registro retornado nesta página do cruzamento.</p>
      <div class="scroll" tabindex="0" role="region" aria-label="Tabela do cruzamento">
        <table>
          <caption>
            Resultado do cruzamento
          </caption>
          <thead>
            <tr>
              <th v-for="column in result.columns" :key="column" scope="col">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in result.rows" :key="index">
              <td v-for="column in result.columns" :key="column">
                {{ row[column] === null ? "Nulo" : row[column] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        type="button"
        :disabled="disabled || busy || result.page <= 1"
        @click="execute(false, result.page - 1)"
      >
        Página anterior do cruzamento
      </button>
      <button
        type="button"
        :disabled="disabled || busy || result.page * result.pageSize >= result.totalRows"
        @click="execute(false, result.page + 1)"
      >
        Próxima página do cruzamento
      </button>
    </div>
  </section>
</template>
