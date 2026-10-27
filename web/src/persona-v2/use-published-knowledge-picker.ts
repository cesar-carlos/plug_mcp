import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import { z } from "zod";
import {
  catalogSchema,
  profilePageSchema,
  standardPublicationSchema,
  type Catalog,
  type KnowledgeSelection,
  type ProfilePage,
  type StandardPublication,
} from "./knowledge-model";
import type { Source, Training } from "./model";
import {
  appendProfileDrafts,
  appendProfilePublications,
  catalogStillGranted,
  catalogUnavailableMessage,
  isCatalogCurator,
  publishedKnowledgeErrorMessage,
  publishedKnowledgeSelection,
  savedProfileMissingOnPage,
  shouldLoadSavedStandard,
} from "./published-knowledge-picker";
import { emptyProfilePage } from "./source-knowledge";
import { useErrorSummary } from "./useErrorSummary";

export interface PublishedKnowledgePickerProps {
  source: Source;
  sourceBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  initial?: Training["sharedKnowledge"];
  beforeChange: () => Promise<boolean>;
}

export interface PublishedKnowledgePickerEmit {
  (event: "selection", value: KnowledgeSelection | undefined): void;
  (event: "profiles", value: ProfilePage): void;
  (event: "curator", value: boolean): void;
  (event: "touched"): void;
}

export interface PublishedKnowledgePickerState {
  catalogs: Ref<Catalog[]>;
  catalogId: Ref<string>;
  standards: Ref<StandardPublication[]>;
  standardId: Ref<string>;
  profileId: Ref<string>;
  profiles: Ref<ProfilePage>;
  busy: Ref<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  savedProfileMissing: ComputedRef<boolean>;
  choose: (event: Event, kind: "catalog" | "standard" | "profile") => Promise<void>;
  refresh: () => Promise<void>;
  reloadProfiles: () => Promise<void>;
  moreDrafts: () => Promise<void>;
  loadMorePublications: () => Promise<void>;
}

export function usePublishedKnowledgePicker(
  props: PublishedKnowledgePickerProps,
  emit: PublishedKnowledgePickerEmit,
): PublishedKnowledgePickerState {
  const catalogs = ref<Catalog[]>([]);
  const catalogId = ref("");
  const standards = ref<StandardPublication[]>([]);
  const standardId = ref("");
  const profileId = ref("");
  const profiles = ref<ProfilePage>(emptyProfilePage());
  const busy = ref(false);
  const { error, errorSummary } = useErrorSummary();
  let live = true;
  let epoch = 0;
  let initialized = false;
  const catalog = computed(() => catalogs.value.find((item) => item.id === catalogId.value));
  const standard = computed(() => standards.value.find((item) => item.id === standardId.value));
  const profile = computed(() =>
    profiles.value.publications.find((item) => item.publicationId === profileId.value),
  );
  const savedProfileMissing = computed(() =>
    savedProfileMissingOnPage(props.initial, standardId.value, profiles.value.publications),
  );
  function notify(): void {
    emit("selection", publishedKnowledgeSelection(catalogId.value, standard.value, profile.value));
    emit("curator", isCatalogCurator(catalog.value?.role));
    emit("profiles", profiles.value);
  }
  function clearSelection(): void {
    catalogId.value = "";
    standardId.value = "";
    profileId.value = "";
    standards.value = [];
    profiles.value = emptyProfilePage();
    notify();
  }
  async function run(action: (current: () => boolean) => Promise<void>): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    const version = ++epoch;
    busy.value = true;
    error.value = "";
    const current = () => live && version === epoch;
    try {
      await action(current);
    } catch (cause) {
      if (current()) {
        error.value = publishedKnowledgeErrorMessage(cause);
      }
    } finally {
      if (current()) {
        busy.value = false;
      }
    }
  }
  async function loadProfiles(current: () => boolean, append = false): Promise<void> {
    if (!standard.value) {
      return;
    }
    const query = new URLSearchParams({
      catalogId: catalogId.value,
      basePublicationId: standard.value.id,
    });
    if (append && profiles.value.nextPublicationCursor) {
      query.set("beforePublication", profiles.value.nextPublicationCursor);
    }
    const data = profilePageSchema.parse(
      await props.api<unknown>(`${props.sourceBase}/perfis?${query}`),
    );
    if (!current()) {
      return;
    }
    profiles.value = append ? appendProfilePublications(profiles.value, data) : data;
    notify();
  }
  async function loadStandards(current: () => boolean): Promise<void> {
    const data = z
      .object({
        patterns: z
          .array(z.object({ id: z.uuid(), activePublicationId: z.uuid().nullable() }))
          .optional(),
        publications: z.array(standardPublicationSchema).optional(),
      })
      .parse(await props.api<unknown>(`/api/admin/catalogos/${catalogId.value}/padroes`));
    if (!current()) {
      return;
    }
    const list = [...(data.publications ?? [])];
    for (const pattern of data.patterns ?? []) {
      if (!pattern.activePublicationId) {
        continue;
      }
      const result = z
        .object({ publication: standardPublicationSchema })
        .parse(
          await props.api<unknown>(
            `/api/admin/catalogos/${catalogId.value}/publicacoes/${pattern.activePublicationId}`,
          ),
        );
      if (!current()) {
        return;
      }
      if (!result.publication.suspendedAt) {
        list.push(result.publication);
      }
    }
    if (shouldLoadSavedStandard(props.initial, catalogId.value, list)) {
      const result = z
        .object({ publication: standardPublicationSchema })
        .parse(
          await props.api<unknown>(
            `/api/admin/catalogos/${catalogId.value}/publicacoes/${props.initial!.publicationId}`,
          ),
        );
      if (!current()) {
        return;
      }
      list.push(result.publication);
    }
    standards.value = list;
    notify();
  }
  async function choose(event: Event, kind: "catalog" | "standard" | "profile"): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    const input = event.target as HTMLSelectElement;
    const next = input.value;
    const original =
      kind === "catalog"
        ? catalogId.value
        : kind === "standard"
          ? standardId.value
          : profileId.value;
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
        profiles.value = emptyProfilePage();
        notify();
        if (next) {
          await loadStandards(current);
        }
      } else if (kind === "standard") {
        standardId.value = next;
        profileId.value = "";
        profiles.value = emptyProfilePage();
        notify();
        if (next) {
          await loadProfiles(current);
        }
      } else {
        profileId.value = next;
        notify();
      }
    });
  }
  async function refresh(): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    if (!(await props.beforeChange())) {
      return;
    }
    await run(async (current) => {
      const data = z
        .object({ catalogs: z.array(catalogSchema) })
        .parse(await props.api<unknown>("/api/admin/catalogos"));
      if (!current()) {
        return;
      }
      catalogs.value = data.catalogs;
      if (!catalogStillGranted(data.catalogs, catalogId.value)) {
        catalogId.value = "";
        standardId.value = "";
        profileId.value = "";
        standards.value = [];
        profiles.value = emptyProfilePage();
        notify();
        throw new Error(catalogUnavailableMessage);
      }
      if (catalogId.value) {
        await loadStandards(current);
        if (current() && standardId.value) {
          await loadProfiles(current);
        }
      }
    });
  }
  async function reloadProfiles(): Promise<void> {
    await run((current) => loadProfiles(current));
  }
  async function moreDrafts(): Promise<void> {
    await run(async (current) => {
      if (!standard.value || !profiles.value.nextDraftCursor) {
        return;
      }
      const query = new URLSearchParams({
        catalogId: catalogId.value,
        basePublicationId: standard.value.id,
        beforeDraft: profiles.value.nextDraftCursor,
      });
      const data = profilePageSchema.parse(
        await props.api<unknown>(`${props.sourceBase}/perfis?${query}`),
      );
      if (!current()) {
        return;
      }
      profiles.value = appendProfileDrafts(profiles.value, data);
      notify();
    });
  }
  async function loadMorePublications(): Promise<void> {
    await run((current) => loadProfiles(current, true));
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
      clearSelection();
    },
  );
  watch(
    () => [props.disabled, props.source.id] as const,
    ([disabled]) => {
      if (disabled || initialized || !live) {
        return;
      }
      initialized = true;
      void run(async (current) => {
        const data = z
          .object({ catalogs: z.array(catalogSchema) })
          .parse(await props.api<unknown>("/api/admin/catalogos"));
        if (!current()) {
          return;
        }
        catalogs.value = data.catalogs;
        if (props.initial && data.catalogs.some((item) => item.id === props.initial!.catalogId)) {
          catalogId.value = props.initial.catalogId;
          await loadStandards(current);
          if (!current()) {
            return;
          }
          standardId.value = props.initial.publicationId;
          await loadProfiles(current);
          if (!current()) {
            return;
          }
          if (
            props.initial.profilePublicationId &&
            profiles.value.publications.some(
              (item) => item.publicationId === props.initial!.profilePublicationId,
            )
          ) {
            profileId.value = props.initial.profilePublicationId;
          }
          notify();
        }
      });
    },
    { immediate: true },
  );
  return {
    catalogs,
    catalogId,
    standards,
    standardId,
    profileId,
    profiles,
    busy,
    error,
    errorSummary,
    savedProfileMissing,
    choose,
    refresh,
    reloadProfiles,
    moreDrafts,
    loadMorePublications,
  };
}
