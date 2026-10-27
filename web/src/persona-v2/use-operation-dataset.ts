import { computed, ref, watch, type Ref } from "vue";
import {
  datasetCaseOptionsSchema,
  type DatasetCaseOptions,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { SkillDraft } from "../../../src/domain/persona-v2/catalog";
import {
  federationDatasetSeedsSchema,
  type FederationDatasetSeeds,
} from "../../../src/domain/persona-v2/federation-dataset";
import {
  operationDatasetSeedsSchema,
  type OperationDatasetSeeds,
} from "../../../src/domain/persona-v2/operation-dataset";
import {
  datasetOptionsContextMatches,
  isFederationSourceSeeds,
  mergeDatasetCaseOptions,
  missingSourceQueriesMessage,
  operationDatasetSeedsMatchSelection,
  operationDatasetSeedsPath,
  selectedDatasetOption,
  sourceQueryDrafts,
  type OperationDatasetPreview,
} from "./operation-dataset";
import { useDatasetRequest } from "./useDatasetRequest";
import { useErrorSummary } from "./useErrorSummary";

export interface OperationDatasetPickerProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  skillId: string;
  revision: number;
  sourceId: string;
  disabled: boolean;
  federationPublicationId?: string;
}

export interface OperationDatasetPickerEmit {
  (event: "choose", value: OperationDatasetSeeds): void;
  (event: "federation", value: FederationDatasetSeeds): void;
  (event: "lock", value: boolean): void;
}

export interface OperationDatasetState {
  queries: Ref<SkillDraft[]>;
  selected: Ref<string>;
  preview: Ref<OperationDatasetPreview | undefined>;
  options: Ref<DatasetCaseOptions | undefined>;
  datasetKey: Ref<string>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  busy: Ref<boolean>;
  resetSelection: () => void;
  load: () => Promise<void>;
  loadOptions: (more?: boolean) => Promise<void>;
  prepare: () => Promise<void>;
  apply: () => void;
}

export function useOperationDataset(
  props: OperationDatasetPickerProps,
  emit: OperationDatasetPickerEmit,
): OperationDatasetState {
  const queries = ref<SkillDraft[]>([]);
  const selected = ref("");
  const preview = ref<OperationDatasetPreview>();
  const options = ref<DatasetCaseOptions>();
  const datasetKey = ref("");

  function resetSelection(): void {
    preview.value = undefined;
    options.value = undefined;
    datasetKey.value = "";
  }

  const context = computed(() =>
    JSON.stringify([
      props.base,
      props.skillId,
      props.revision,
      props.sourceId,
      props.federationPublicationId,
      selected.value,
      datasetKey.value,
    ]),
  );
  watch(
    () => [
      props.base,
      props.skillId,
      props.revision,
      props.sourceId,
      props.federationPublicationId,
    ],
    () => {
      queries.value = [];
      selected.value = "";
      resetSelection();
    },
    { flush: "sync" },
  );

  const { error, errorSummary } = useErrorSummary();
  const { busy, run } = useDatasetRequest(
    () => context.value,
    () => props.disabled,
    error,
    () => {
      preview.value = undefined;
    },
    (value) => emit("lock", value),
  );

  async function load(): Promise<void> {
    await run(async (isCurrent) => {
      preview.value = undefined;
      const result = await props.api<{ skills: SkillDraft[] }>(`${props.base}/skills`);
      if (!isCurrent()) {
        return;
      }
      queries.value = sourceQueryDrafts(
        result.skills,
        props.sourceId,
        props.federationPublicationId,
      );
      selected.value = "";
      resetSelection();
      const missing = missingSourceQueriesMessage(queries.value);
      if (missing) {
        error.value = missing;
      }
    });
  }

  async function loadOptions(more = false): Promise<void> {
    await run(async (isCurrent) => {
      const query = queries.value.find((item) => item.id === selected.value);
      const previous = options.value;
      if (!query || (more && !previous?.nextCursor)) {
        return;
      }
      preview.value = undefined;
      const page = datasetCaseOptionsSchema.parse(
        await props.api(`${props.base}/skills/${query.id}/datasets-caso`, {
          expectedRevision: query.revision,
          ...(more && previous ? { after: previous.nextCursor } : {}),
        }),
      );
      if (!isCurrent()) {
        return;
      }
      if (
        !datasetOptionsContextMatches({
          page,
          queryRevision: query.revision,
          sourceId: props.sourceId,
          more,
          previous,
        })
      ) {
        throw new Error("O contexto do dataset mudou; confira novamente a consulta de origem.");
      }
      const merged = mergeDatasetCaseOptions(previous, page, more);
      if (!merged.ok) {
        throw new Error("A referência do dataset mudou; releia a lista.");
      }
      options.value = { ...page, datasets: merged.datasets };
      if (!more) {
        datasetKey.value = "";
      }
    });
  }

  async function prepare(): Promise<void> {
    await run(async (isCurrent) => {
      preview.value = undefined;
      const query = queries.value.find((item) => item.id === selected.value);
      if (!query) {
        return;
      }
      const dataset = selectedDatasetOption(options.value, datasetKey.value);
      if (datasetKey.value && !dataset) {
        throw new Error("Selecione uma versão disponível do dataset.");
      }
      const result = (
        props.federationPublicationId ? federationDatasetSeedsSchema : operationDatasetSeedsSchema
      ).parse(
        await props.api(
          `${props.base}/skills/${props.skillId}/${operationDatasetSeedsPath(props.federationPublicationId)}`,
          {
            expectedRevision: props.revision,
            querySkillId: query.id,
            queryRevision: query.revision,
            ...(props.federationPublicationId
              ? { publicationId: props.federationPublicationId }
              : {}),
            ...(dataset
              ? { dataset: { id: dataset.id, version: dataset.version, hash: dataset.hash } }
              : {}),
          },
        ),
      );
      if (!isCurrent()) {
        return;
      }
      if (
        !operationDatasetSeedsMatchSelection({
          result,
          revision: props.revision,
          sourceId: props.sourceId,
          querySkillId: query.id,
          queryRevision: query.revision,
          federationPublicationId: props.federationPublicationId,
          dataset,
        })
      ) {
        throw new Error(
          "Não foi possível confirmar a origem das sementes; a edição foi preservada.",
        );
      }
      preview.value = result;
    });
  }

  function apply(): void {
    if (busy.value || props.disabled || !preview.value) {
      return;
    }
    if (isFederationSourceSeeds(preview.value)) {
      emit("federation", federationDatasetSeedsSchema.parse(preview.value));
    } else {
      emit("choose", operationDatasetSeedsSchema.parse(preview.value));
    }
    preview.value = undefined;
  }

  return {
    queries,
    selected,
    preview,
    options,
    datasetKey,
    error,
    errorSummary,
    busy,
    resetSelection,
    load,
    loadOptions,
    prepare,
    apply,
  };
}
