<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { KnowledgeProposal } from "../../../src/domain/persona-v2/knowledge-curation";
import type { PhysicalKnowledgeProposal } from "../../../src/domain/persona-v2/physical-curation";
import type { ProfilePublication } from "./knowledge-model";
import { knowledgeProposalInputSchema } from "../../../src/domain/persona-v2/knowledge-curation";
import { structureContentSchema } from "../../../src/domain/persona-v2/structure-content-schema";
import KnowledgeContentSummary from "./KnowledgeContentSummary.vue";
import StructureEditor from "./StructureEditor.vue";
import { standardPublicationSchema } from "./knowledge-model";
import type { Content } from "./knowledge-model";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  catalogId: string;
  role: string;
  patterns: { id: string; name: string; activePublicationId: string | null }[];
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  draftDirty: boolean;
  confirmDiscard: () => Promise<boolean>;
  physical?: { sourceBase: string; publication: ProfilePublication };
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  updated: [resourceId: string];
}>();
type Proposal = KnowledgeProposal | PhysicalKnowledgeProposal;
const proposals = ref<Proposal[]>([]),
  nextCursor = ref<string | null>(null),
  selected = ref<Proposal>();
const baseId = ref(props.physical?.publication.publicationId ?? ""),
  summary = ref(""),
  kind = ref<KnowledgeProposal["change"]["kind"]>("regra"),
  rule = ref("");
const proposalContent = ref<Content>(),
  loadedBaseId = ref(""),
  originalContent = ref(""),
  targetId = ref("");
const structuralItems = computed(() =>
  kind.value === "tabela"
    ? (proposalContent.value?.tables ?? [])
    : (proposalContent.value?.relationships ?? []),
);
const example = ref({
  id: "",
  purpose: "",
  explanation: "",
  variants: [
    {
      dialect: "postgres",
      sql: "",
      parameters: [] as {
        name: string;
        type: "string" | "integer" | "decimal" | "boolean" | "date" | "datetime";
        required: boolean;
        meaning: string;
      }[],
    },
  ],
});
const busy = ref(false),
  confirmed = ref(false),
  reason = ref(""),
  message = ref("");
const { error, errorSummary } = useErrorSummary();
const preview = ref<{
  confirmationHash: string;
  expiresAt: string;
  content: Content;
  patternRevision?: number;
  profileRevision?: number;
  changes: { kind: string; path: string }[];
}>();
const physicalMayReview = ref(false),
  overrideCommon = ref(false);
const mayReview = computed(() =>
  props.physical ? physicalMayReview.value : ["administrator", "curator"].includes(props.role),
);
const bases = computed(() =>
  props.physical
    ? [
        {
          id: props.physical.publication.id,
          name: `${props.physical.publication.name} · revisão ${props.physical.publication.revision}`,
          activePublicationId: props.physical.publication.publicationId,
        },
      ]
    : props.patterns,
);
const fingerprint = computed(() =>
  JSON.stringify([
    baseId.value,
    summary.value,
    kind.value,
    rule.value,
    example.value,
    proposalContent.value,
    targetId.value,
    overrideCommon.value,
  ]),
);
const saved = ref(fingerprint.value);
const dirty = computed(
  () => fingerprint.value !== saved.value || !!reason.value || confirmed.value,
);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
let live = true;
const timer = window.setInterval(() => {
  if (preview.value && Date.parse(preview.value.expiresAt) <= Date.now()) {
    preview.value = undefined;
    confirmed.value = false;
    message.value = "Revisão expirada. Revise novamente.";
  }
}, 1000);
onBeforeUnmount(() => {
  live = false;
  window.clearInterval(timer);
  emit("dirty", false);
});
const root = () =>
  props.physical
    ? `${props.physical.sourceBase}/perfis/curadoria/${props.catalogId}/${props.physical.publication.publicationId}/propostas`
    : `/api/admin/catalogos/${props.catalogId}/propostas`;
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (cause) {
    if (live)
      error.value =
        cause instanceof Error ? cause.message : "Não foi possível concluir a curadoria.";
  } finally {
    if (live) busy.value = false;
    emit("lock", false);
  }
}
async function refresh(append = false) {
  const data = await props.api<{
    proposals: Proposal[];
    nextCursor: string | null;
    mayReview?: boolean;
  }>(
    `${root()}${append && nextCursor.value ? `?beforeId=${encodeURIComponent(nextCursor.value)}` : ""}`,
  );
  if (!live) return;
  proposals.value = append ? [...proposals.value, ...data.proposals] : data.proposals;
  nextCursor.value = data.nextCursor;
  physicalMayReview.value = data.mayReview === true;
}
async function propose() {
  await run(async () => {
    if (
      (kind.value === "tabela" || kind.value === "relacionamento") &&
      loadedBaseId.value !== baseId.value
    ) {
      throw new Error("Carregue a versão base selecionada antes de propor estrutura.");
    }
    const change =
      kind.value === "regra"
        ? { kind: "regra", value: rule.value }
        : kind.value === "exemplo_sql"
          ? { kind: "exemplo_sql", value: { ...example.value, state: "candidate" } }
          : {
              kind: kind.value,
              value: structuralItems.value.find((item) => item.id === targetId.value),
            };
    const input = knowledgeProposalInputSchema.parse({ summary: summary.value, change });
    await props.api(
      root(),
      props.physical
        ? { ...input, profilePublicationId: baseId.value, overrideCommon: overrideCommon.value }
        : { ...input, basePublicationId: baseId.value },
    );
    if (!live) return;
    summary.value = "";
    rule.value = "";
    proposalContent.value = undefined;
    loadedBaseId.value = "";
    originalContent.value = "";
    targetId.value = "";
    overrideCommon.value = false;
    example.value = {
      id: "",
      purpose: "",
      explanation: "",
      variants: [{ dialect: "postgres", sql: "", parameters: [] }],
    };
    saved.value = fingerprint.value;
    await refresh();
    message.value = "Proposta enviada. Ela não altera rascunho, publicação ou permissões.";
  });
}
async function loadStructure() {
  if (!baseId.value || busy.value || props.disabled) return;
  if (
    proposalContent.value &&
    JSON.stringify(proposalContent.value) !== originalContent.value &&
    !(await props.confirmDiscard())
  )
    return;
  const base = baseId.value;
  await run(async () => {
    const result = props.physical
      ? null
      : await props.api<{ publication: unknown }>(
          `/api/admin/catalogos/${props.catalogId}/publicacoes/${base}`,
        );
    if (!live || baseId.value !== base) return;
    const publication = props.physical
      ? {
          id: props.physical.publication.publicationId,
          content: props.physical.publication.content,
          suspendedAt: props.physical.publication.suspended ? "suspended" : null,
        }
      : standardPublicationSchema.parse(result!.publication);
    if (publication.id !== base || publication.suspendedAt)
      throw new Error("Versão base indisponível.");
    proposalContent.value = JSON.parse(JSON.stringify(publication.content)) as Content;
    loadedBaseId.value = base;
    originalContent.value = JSON.stringify(publication.content);
    targetId.value = "";
    message.value =
      "Estrutura publicada carregada para proposta. Somente o item selecionado será enviado.";
  });
}
async function select(p: Proposal) {
  if ((reason.value || confirmed.value) && !(await props.confirmDiscard())) return;
  selected.value = p;
  reason.value = "";
  confirmed.value = false;
  preview.value = undefined;
  error.value = "";
  message.value = "";
}
async function review() {
  if (!selected.value || props.draftDirty) return;
  const id = selected.value.id;
  await run(async () => {
    const data = await props.api<{
      confirmationHash: string;
      expiresAt: string;
      content: unknown;
      patternRevision?: number;
      profileRevision?: number;
      changes: { kind: string; path: string }[];
    }>(`${root()}/${id}/preview`, {});
    if (live) {
      preview.value = { ...data, content: structureContentSchema.parse(data.content) };
      confirmed.value = false;
    }
  });
}
async function decide(action: "incorporar" | "rejeitar") {
  if (!selected.value || !confirmed.value || !reason.value.trim() || props.draftDirty) return;
  const current = selected.value,
    p = preview.value;
  let changed = "";
  await run(async () => {
    if (action === "incorporar" && !p)
      throw new Error("Revise o conteúdo exato antes de incorporar.");
    await props.api(
      `${root()}/${current.id}/${action}`,
      action === "incorporar"
        ? { confirmationHash: p!.confirmationHash, reason: reason.value }
        : { expectedVersion: current.version, reason: reason.value },
    );
    if (!live) return;
    selected.value = undefined;
    reason.value = "";
    confirmed.value = false;
    preview.value = undefined;
    await refresh();
    message.value =
      action === "incorporar"
        ? `Proposta incorporada somente ao rascunho. Revise exemplos e publique ${props.physical ? "o perfil" : "o padrão"} separadamente; skills e tokens permanecem sem atualização automática.`
        : "Proposta rejeitada; conteúdo e publicações preservados.";
    if (action === "incorporar")
      changed = "profileId" in current ? current.profileId : current.patternId;
  });
  await nextTick();
  if (live && changed) emit("updated", changed);
}
const stateLabels = {
  pending: "Pendente",
  incorporated: "Incorporada ao rascunho",
  rejected: "Rejeitada",
};
const kindLabels = {
  tabela: "Tabela e campos",
  relacionamento: "Relacionamento",
  exemplo_sql: "Exemplo SQL",
  regra: "Regra",
};
const changeLabels: Record<string, string> = {
  added: "Acrescentado",
  removed: "Removido",
  changed: "Alterado",
};
const fieldLabels: Record<string, string> = {
  tables: "Tabelas",
  columns: "Campos",
  relationships: "Relacionamentos",
  examples: "Exemplos SQL",
  rules: "Regras de negócio",
  meaning: "Significado",
  grain: "Grão",
  classification: "Classificação",
  nullable: "Aceita nulo",
  logicalType: "Tipo lógico",
  nativeTypes: "Tipos nativos",
  physicalNames: "Nomes físicos",
  keys: "Chaves",
  cardinality: "Cardinalidade",
  optional: "Opcionalidade",
  via: "Intermediárias",
  path: "Caminho",
  variants: "Variantes",
  parameters: "Parâmetros",
  purpose: "Finalidade",
  explanation: "Explicação",
  state: "Estado editorial",
  name: "Nome",
  sql: "SQL",
  join: "JOIN",
  from: "Origem",
  to: "Destino",
};
const changePath = (path: string) =>
  path
    .split("/")
    .map((part) => fieldLabels[part] ?? part)
    .join(" → ");
void run(() => refresh());
</script>
<template>
  <section
    :aria-label="physical ? 'Curadoria de particularidades físicas' : 'Curadoria do conhecimento'"
  >
    <h3>Propostas de conhecimento</h3>
    <p>
      Envio explícito, proveniência e revisão por curador. Incorporar altera apenas o rascunho; não
      publica nem confirma fatos técnicos.
    </p>
    <p v-if="physical">
      Propostas vinculadas ao perfil publicado desta base. Incorporação altera somente seu rascunho;
      publique e adote a nova versão separadamente.
    </p>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="disabled || busy">
      <button type="button" class="secondary" @click="run(() => refresh())">
        Atualizar propostas
      </button>
      <ul>
        <li v-for="p in proposals" :key="p.id">
          <button type="button" class="secondary" @click="select(p)">
            {{ p.summary }} — {{ stateLabels[p.state] }}
          </button>
        </li>
      </ul>
      <p v-if="!proposals.length">
        Nenhuma proposta visível nesta página. Colaboradores veem somente suas próprias propostas.
      </p>
      <button v-if="nextCursor" type="button" class="secondary" @click="run(() => refresh(true))">
        Carregar mais propostas
      </button>
      <article v-if="selected" aria-label="Proposta selecionada">
        <h4>{{ selected.summary }}</h4>
        <p>
          {{ kindLabels[selected.change.kind] }} · {{ stateLabels[selected.state] }} · versão
          {{ selected.version }}
        </p>
        <p>
          Origem:
          {{
            selected.origin === "mcp"
              ? "Envio explícito pelo consumidor MCP"
              : "Console autenticado"
          }}
          · {{ new Date(selected.createdAt).toLocaleString() }}
        </p>
        <p v-if="selected.change.kind === 'regra'">{{ selected.change.value }}</p>
        <template v-else-if="selected.change.kind === 'exemplo_sql'"
          ><p>{{ selected.change.value.purpose }} — {{ selected.change.value.explanation }}</p>
          <details v-for="variant in selected.change.value.variants" :key="variant.dialect">
            <summary>Exemplo proposto · {{ variant.dialect }}</summary>
            <pre>{{ variant.sql }}</pre>
            <ul>
              <li v-for="parameter in variant.parameters" :key="parameter.name">
                {{ parameter.name }} · {{ parameter.type }} · {{ parameter.meaning }}
              </li>
            </ul>
          </details></template
        >
        <template v-else-if="selected.change.kind === 'tabela'"
          ><p>{{ selected.change.value.name }} — {{ selected.change.value.meaning }}</p>
          <ul>
            <li v-for="column in selected.change.value.columns" :key="column.name">
              {{ column.name }} — {{ column.meaning }} · {{ column.logicalType }} ·
              {{ column.classification }}
            </li>
          </ul></template
        >
        <p v-else>
          {{ selected.change.value.meaning }} · {{ selected.change.value.cardinality }} ·
          {{ selected.change.value.keys.map((k) => `${k.from} → ${k.to}`).join(", ") }}
        </p>
        <details>
          <summary>Proveniência da proposta</summary>
          <p>Responsável de origem: {{ selected.ownerId }}</p>
          <p v-if="selected.personaId">
            Persona: {{ selected.personaId }} · fonte: {{ selected.sourceId }} · skill:
            {{ selected.skillId }}
          </p>
          <p class="technical-value">Hash: {{ selected.hash }}</p>
          <p v-if="'profilePublicationId' in selected" class="technical-value">
            Perfil-base: {{ selected.profilePublicationId }} · identidade:
            {{ selected.identityHash }} · versão da fonte: {{ selected.sourceVersion }} ·
            credencial: {{ selected.credentialVersion }}
          </p>
          <p v-if="selected.reviewedAt">
            Revisão: {{ new Date(selected.reviewedAt).toLocaleString() }} · {{ selected.reason }}
          </p>
        </details>
        <template v-if="mayReview && selected.state === 'pending'">
          <p v-if="draftDirty" class="notice">
            Salve ou descarte a edição {{ physical ? "do perfil" : "do padrão" }} antes de revisar
            uma incorporação.
          </p>
          <button type="button" :disabled="draftDirty" @click="review">
            Revisar incorporação ao rascunho
          </button>
          <section v-if="preview" aria-label="Revisão da incorporação">
            <h4>
              Conteúdo proposto para a revisão
              {{ (preview.profileRevision ?? preview.patternRevision ?? 0) + 1 }}
            </h4>
            <p>
              Válido até {{ new Date(preview.expiresAt).toLocaleTimeString() }}. Exemplos novos
              permanecem candidatos.
            </p>
            <ul>
              <li v-for="change in preview.changes" :key="change.path">
                {{ changeLabels[change.kind] ?? change.kind }}: {{ changePath(change.path) }}
              </li>
            </ul>
            <KnowledgeContentSummary
              :content="preview.content"
              :dialect="preview.content.dialects[0]!"
              :draft="true"
            />
          </section>
          <label
            >Justificativa da decisão<textarea v-model="reason" maxlength="2000" required /></label
          ><label class="check"
            ><input v-model="confirmed" type="checkbox" :disabled="draftDirty" />Revisei a proposta
            e os efeitos desta decisão sobre o rascunho.</label
          >
          <button
            type="button"
            :disabled="!preview || !confirmed || !reason.trim() || draftDirty"
            @click="decide('incorporar')"
          >
            Incorporar proposta ao rascunho</button
          ><button
            type="button"
            class="danger"
            :disabled="!confirmed || !reason.trim() || draftDirty"
            @click="decide('rejeitar')"
          >
            Rejeitar proposta
          </button>
        </template>
      </article>
      <form aria-label="Propor conhecimento compartilhado" @submit.prevent="propose">
        <h4>Enviar conhecimento para revisão</h4>
        <label
          >Versão base da proposta<select v-model="baseId" required>
            <option value="">Selecione {{ physical ? "um perfil" : "um padrão" }} publicado</option>
            <option
              v-for="p in bases.filter((p) => p.activePublicationId)"
              :key="p.id"
              :value="p.activePublicationId!"
            >
              {{ p.name }}
            </option>
          </select></label
        >
        <label>Resumo da proposta<input v-model="summary" maxlength="2000" required /></label
        ><label
          >Tipo de proposta<select v-model="kind">
            <option value="regra">Regra de negócio</option>
            <option value="exemplo_sql">Exemplo SQL</option>
            <option value="tabela">Tabela e campos</option>
            <option value="relacionamento">Relacionamento</option>
          </select></label
        >
        <label v-if="kind === 'regra'"
          >Regra proposta<textarea v-model="rule" maxlength="5000" required />
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
              >SQL proposto<textarea
                v-model="variant.sql"
                class="sql"
                spellcheck="false"
                required
              />
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
          <button type="button" class="secondary" :disabled="!baseId" @click="loadStructure">
            Carregar estrutura da versão base
          </button>
          <p v-if="loadedBaseId !== baseId || !proposalContent" class="notice">
            Carregue a versão base para usar tabelas, campos e relacionamentos existentes.
          </p>
          <template v-else>
            <p>
              Edite a definição e selecione o item para envio. Outras alterações no formulário não
              serão incorporadas à proposta. Publicações e rascunhos existentes permanecem
              preservados.
            </p>
            <StructureEditor
              v-model="proposalContent"
              :sections="kind === 'tabela' ? ['tables'] : ['relationships']"
            />
            <label
              >Item estrutural da proposta<select v-model="targetId" required>
                <option value="">Selecione somente uma definição</option>
                <option v-for="item in structuralItems" :key="item.id" :value="item.id">
                  {{ item.id }} · {{ item.meaning }}
                </option>
              </select></label
            >
          </template>
        </template>
        <label v-if="physical && (kind === 'tabela' || kind === 'relacionamento')" class="check"
          ><input v-model="overrideCommon" type="checkbox" />Esta proposta substitui explicitamente
          uma definição comum revisada.</label
        >
        <button type="submit">Enviar proposta de conhecimento</button>
      </form>
    </fieldset>
  </section>
</template>
