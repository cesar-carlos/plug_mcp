<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { z } from "zod";
import {
  catalogSchema,
  standardPublicationSchema,
  profilePageSchema,
  type Catalog,
  type StandardPublication,
  type ProfilePage,
  type KnowledgeSelection,
} from "./knowledge-model";
import type { Source, Training } from "./model";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  source: Source;
  sourceBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  initial?: Training["sharedKnowledge"];
  beforeChange: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  selection: [value: KnowledgeSelection | undefined];
  profiles: [value: ProfilePage];
  curator: [value: boolean];
  touched: [];
}>();
const catalogs = ref<Catalog[]>([]),
  catalogId = ref(""),
  standards = ref<StandardPublication[]>([]),
  standardId = ref(""),
  profileId = ref("");
const profiles = ref<ProfilePage>({
  drafts: [],
  publications: [],
  nextDraftCursor: null,
  nextPublicationCursor: null,
});
const busy = ref(false);
const { error, errorSummary } = useErrorSummary();
let live = true,
  epoch = 0,
  initialized = false;
const catalog = computed(() => catalogs.value.find((c) => c.id === catalogId.value));
const standard = computed(() => standards.value.find((p) => p.id === standardId.value));
const profile = computed(() =>
  profiles.value.publications.find((p) => p.publicationId === profileId.value),
);
function notify() {
  emit(
    "selection",
    standard.value
      ? {
          catalogId: catalogId.value,
          standard: standard.value,
          ...(profile.value ? { profile: profile.value } : {}),
        }
      : undefined,
  );
  emit("curator", ["administrator", "curator"].includes(catalog.value?.role ?? ""));
  emit("profiles", profiles.value);
}
async function run(action: (current: () => boolean) => Promise<void>) {
  if (busy.value || props.disabled) return;
  const version = ++epoch;
  busy.value = true;
  error.value = "";
  const current = () => live && version === epoch;
  try {
    await action(current);
  } catch (cause) {
    if (current())
      error.value =
        cause instanceof Error ? cause.message : "Não foi possível carregar o conhecimento.";
  } finally {
    if (current()) busy.value = false;
  }
}
async function loadProfiles(current: () => boolean, append = false) {
  if (!standard.value) return;
  const query = new URLSearchParams({
    catalogId: catalogId.value,
    basePublicationId: standard.value.id,
  });
  if (append && profiles.value.nextPublicationCursor)
    query.set("beforePublication", profiles.value.nextPublicationCursor);
  const data = profilePageSchema.parse(
    await props.api<unknown>(`${props.sourceBase}/perfis?${query}`),
  );
  if (!current()) return;
  profiles.value = append
    ? {
        ...data,
        drafts: profiles.value.drafts,
        nextDraftCursor: profiles.value.nextDraftCursor,
        publications: [...profiles.value.publications, ...data.publications],
      }
    : data;
  notify();
}
async function loadStandards(current: () => boolean) {
  const data = z
    .object({
      patterns: z
        .array(z.object({ id: z.uuid(), activePublicationId: z.uuid().nullable() }))
        .optional(),
      publications: z.array(standardPublicationSchema).optional(),
    })
    .parse(await props.api<unknown>(`/api/admin/catalogos/${catalogId.value}/padroes`));
  if (!current()) return;
  const list = [...(data.publications ?? [])];
  for (const pattern of data.patterns ?? []) {
    if (!pattern.activePublicationId) continue;
    const result = z
      .object({ publication: standardPublicationSchema })
      .parse(
        await props.api<unknown>(
          `/api/admin/catalogos/${catalogId.value}/publicacoes/${pattern.activePublicationId}`,
        ),
      );
    if (!current()) return;
    if (!result.publication.suspendedAt) list.push(result.publication);
  }
  if (
    props.initial?.catalogId === catalogId.value &&
    !list.some((p) => p.id === props.initial!.publicationId)
  ) {
    const result = z
      .object({ publication: standardPublicationSchema })
      .parse(
        await props.api<unknown>(
          `/api/admin/catalogos/${catalogId.value}/publicacoes/${props.initial.publicationId}`,
        ),
      );
    if (!current()) return;
    list.push(result.publication);
  }
  standards.value = list;
  notify();
}
async function choose(event: Event, kind: "catalog" | "standard" | "profile") {
  if (busy.value || props.disabled) return;
  const input = event.target as HTMLSelectElement;
  const next = input.value;
  const original =
    kind === "catalog" ? catalogId.value : kind === "standard" ? standardId.value : profileId.value;
  if (!(await props.beforeChange())) {
    input.value = original;
    return;
  }
  emit("touched");
  await run(async (current) => {
    if (kind === "catalog") {
      catalogId.value = next;
      standardId.value = "";
      profileId.value = "";
      standards.value = [];
      profiles.value = {
        drafts: [],
        publications: [],
        nextDraftCursor: null,
        nextPublicationCursor: null,
      };
      notify();
      if (next) await loadStandards(current);
    } else if (kind === "standard") {
      standardId.value = next;
      profileId.value = "";
      profiles.value = {
        drafts: [],
        publications: [],
        nextDraftCursor: null,
        nextPublicationCursor: null,
      };
      notify();
      if (next) await loadProfiles(current);
    } else {
      profileId.value = next;
      notify();
    }
  });
}
async function refresh() {
  if (busy.value || props.disabled) return;
  if (!(await props.beforeChange())) return;
  await run(async (current) => {
    const data = z
      .object({ catalogs: z.array(catalogSchema) })
      .parse(await props.api<unknown>("/api/admin/catalogos"));
    if (!current()) return;
    catalogs.value = data.catalogs;
    if (catalogId.value && !catalog.value) {
      catalogId.value = "";
      standardId.value = "";
      profileId.value = "";
      standards.value = [];
      profiles.value = {
        drafts: [],
        publications: [],
        nextDraftCursor: null,
        nextPublicationCursor: null,
      };
      notify();
      throw new Error("O catálogo não está mais disponível. Selecione uma concessão vigente.");
    }
    if (catalogId.value) {
      await loadStandards(current);
      if (current() && standardId.value) await loadProfiles(current);
    }
  });
}
onBeforeUnmount(() => {
  live = false;
  epoch++;
});
watch(
  () => props.source.id,
  () => {
    epoch++;
    initialized = false;
    busy.value = false;
    catalogId.value = "";
    standardId.value = "";
    profileId.value = "";
    standards.value = [];
    profiles.value = {
      drafts: [],
      publications: [],
      nextDraftCursor: null,
      nextPublicationCursor: null,
    };
    notify();
  },
);
watch(
  () => [props.disabled, props.source.id] as const,
  ([disabled]) => {
    if (disabled || initialized || !live) return;
    initialized = true;
    void run(async (current) => {
      const data = z
        .object({ catalogs: z.array(catalogSchema) })
        .parse(await props.api<unknown>("/api/admin/catalogos"));
      if (!current()) return;
      catalogs.value = data.catalogs;
      if (props.initial && data.catalogs.some((c) => c.id === props.initial!.catalogId)) {
        catalogId.value = props.initial.catalogId;
        await loadStandards(current);
        if (!current()) return;
        standardId.value = props.initial.publicationId;
        await loadProfiles(current);
        if (!current()) return;
        if (
          props.initial.profilePublicationId &&
          profiles.value.publications.some(
            (p) => p.publicationId === props.initial!.profilePublicationId,
          )
        )
          profileId.value = props.initial.profilePublicationId;
        notify();
      }
    });
  },
  { immediate: true },
);
async function reloadProfiles() {
  await run((current) => loadProfiles(current));
}
async function moreDrafts() {
  await run(async (current) => {
    if (!standard.value || !profiles.value.nextDraftCursor) return;
    const query = new URLSearchParams({
      catalogId: catalogId.value,
      basePublicationId: standard.value.id,
      beforeDraft: profiles.value.nextDraftCursor,
    });
    const data = profilePageSchema.parse(
      await props.api<unknown>(`${props.sourceBase}/perfis?${query}`),
    );
    if (!current()) return;
    profiles.value = {
      ...profiles.value,
      drafts: [...profiles.value.drafts, ...data.drafts],
      nextDraftCursor: data.nextDraftCursor,
    };
    notify();
  });
}
defineExpose({ refresh, reloadProfiles, moreDrafts });
</script>
<template>
  <section aria-label="Selecionar conhecimento publicado">
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <fieldset :disabled="disabled || busy">
      <legend>Versões publicadas</legend>
      <label
        >Catálogo autorizado<select :value="catalogId" @change="choose($event, 'catalog')">
          <option value="">Selecione um catálogo</option>
          <option v-for="c in catalogs" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select></label
      >
      <label
        >Versão do padrão<select
          :value="standardId"
          :disabled="!catalogId"
          @change="choose($event, 'standard')"
        >
          <option value="">Selecione uma versão publicada</option>
          <option v-for="p in standards" :key="p.id" :value="p.id" :disabled="!!p.suspendedAt">
            {{ p.content.system }} · {{ p.content.label }} · revisão {{ p.revision
            }}{{ p.suspendedAt ? " (suspensa)" : "" }}
          </option>
        </select></label
      >
      <label
        >Perfil físico publicado<select
          :value="profileId"
          :disabled="!standardId"
          @change="choose($event, 'profile')"
        >
          <option value="">Somente o padrão, sem particularidades</option>
          <option
            v-for="p in profiles.publications"
            :key="p.publicationId"
            :value="p.publicationId"
            :disabled="p.suspended"
          >
            {{ p.name }} · revisão {{ p.revision }}{{ p.suspended ? " (suspenso)" : "" }}
          </option>
        </select></label
      >
      <button
        v-if="profiles.nextPublicationCursor"
        type="button"
        class="secondary"
        @click="run((current) => loadProfiles(current, true))"
      >
        Carregar mais versões de perfil
      </button>
      <button type="button" class="secondary" @click="refresh">
        Atualizar versões disponíveis
      </button>
    </fieldset>
    <p v-if="busy" role="status">Carregando versões autorizadas…</p>
    <p v-else-if="!catalogs.length" class="notice">
      Não há catálogo concedido. O treinamento privado continua disponível.
    </p>
    <p
      v-if="
        initial?.profilePublicationId &&
        standardId === initial.publicationId &&
        !profiles.publications.some((p) => p.publicationId === initial!.profilePublicationId)
      "
      class="notice"
    >
      A versão física salva não está nesta página ou está indisponível. Carregue mais versões e
      revise antes de alterar o vínculo.
    </p>
  </section>
</template>
