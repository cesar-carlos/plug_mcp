import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { FederationPlan } from "../../../src/domain/persona-v2/federation";
import type { Source, Training } from "./model";
import {
  buildFederationPlan,
  federationConsumerSemantics,
  federationSourceName,
  type FederationConsumerContext,
  type FederationConsumerResult,
  type FederationConsumerSkill,
  type FederationLocalInput,
} from "./federation-consumer";

export interface FederationPanelProps {
  personaId: string;
  bearer: string;
  sources: Source[];
  disabled: boolean;
  mcp: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}

export interface FederationPanelEmit {
  (event: "lock", value: boolean): void;
  (event: "dirty", value: boolean): void;
}

export interface FederationPanelState {
  skills: Ref<FederationConsumerSkill[] | undefined>;
  selected: Ref<string>;
  context: Ref<FederationConsumerContext | undefined>;
  inputs: FederationLocalInput[];
  result: Ref<FederationConsumerResult | undefined>;
  pageSize: Ref<number>;
  validated: Ref<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  submitted: Ref<FederationPlan | undefined>;
  busy: Ref<boolean>;
  dirty: ComputedRef<boolean>;
  semantics: typeof federationConsumerSemantics;
  sourceName: (id: string) => string;
  discover: () => Promise<void>;
  choose: (event: Event) => Promise<void>;
  execute: (validation: boolean, page?: number) => Promise<void>;
}

export function useFederationPanel(
  props: FederationPanelProps,
  emit: FederationPanelEmit,
): FederationPanelState {
  const skills = ref<FederationConsumerSkill[]>();
  const selected = ref("");
  const context = ref<FederationConsumerContext>();
  const inputs = reactive<FederationLocalInput[]>([]);
  const result = ref<FederationConsumerResult>();
  const pageSize = ref(100);
  const validated = ref(false);
  const error = ref("");
  const submitted = ref<FederationPlan>();
  const errorSummary = ref<HTMLElement>();
  const initial = ref("");
  const busy = ref(false);
  const fingerprint = computed(() => JSON.stringify(inputs));
  const dirty = computed(() => !!context.value && fingerprint.value !== initial.value);
  const sourceName = (id: string): string => federationSourceName(props.sources, id);
  let live = true;
  let generation = 0;

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

  function clear(): void {
    context.value = undefined;
    inputs.splice(0);
    initial.value = "";
    result.value = undefined;
    submitted.value = undefined;
    validated.value = false;
  }

  async function run(action: (current: () => boolean) => Promise<void>): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
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

  async function permitted(): Promise<FederationConsumerSkill[]> {
    const persona = await props.mcp<{ id: string }>("obter_contexto_persona", {});
    if (persona.id !== props.personaId) {
      throw new Error("Este token pertence a outra persona.");
    }
    return props.mcp<FederationConsumerSkill[]>("listar_skills", {});
  }

  async function discover(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async (current) => {
      const list = await permitted();
      if (!current()) {
        return;
      }
      clear();
      selected.value = "";
      skills.value = list.filter((skill) => skill.kind === "cruzamento");
    });
  }

  async function choose(event: Event): Promise<void> {
    const element = event.target as HTMLSelectElement;
    const next = element.value;
    if (dirty.value && !(await props.confirmDiscard())) {
      element.value = selected.value;
      return;
    }
    await run(async (current) => {
      clear();
      selected.value = next;
      if (!next) {
        return;
      }
      const skill = skills.value?.find((item) => item.id === next);
      if (!skill) {
        throw new Error("Selecione um cruzamento concedido.");
      }
      const published = await props.mcp<FederationConsumerContext>("obter_skill", {
        slug: skill.slug,
      });
      if (!current()) {
        return;
      }
      if (published.publicationId !== skill.publicationId || published.hash !== skill.hash) {
        throw new Error("A publicação mudou. Atualize os cruzamentos permitidos.");
      }
      const permittedSkills = await permitted();
      const locals: FederationLocalInput[] = [];
      for (const step of published.steps) {
        if (step.kind !== "local") {
          continue;
        }
        const dependency = published.dependencies.find(
          (item) => item.publicationId === step.publicationId && item.sourceId === step.sourceId,
        );
        const summary = permittedSkills.find(
          (item) =>
            item.id === dependency?.skillId &&
            item.publicationId === dependency.publicationId &&
            item.hash === dependency.hash,
        );
        if (!dependency || !summary) {
          throw new Error("Uma consulta dependente não está concedida ou mudou.");
        }
        const query = await props.mcp<{
          publicationId: string;
          hash: string;
          sourceId: string;
          sqlModel: string;
          parameters: Training["parameters"];
        }>("obter_skill", { slug: summary.slug });
        if (!current()) {
          return;
        }
        if (
          query.publicationId !== dependency.publicationId ||
          query.hash !== dependency.hash ||
          query.sourceId !== dependency.sourceId
        ) {
          throw new Error("Uma consulta dependente mudou. Atualize os cruzamentos permitidos.");
        }
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
      if (!current()) {
        return;
      }
      inputs.push(...locals);
      context.value = published;
      initial.value = fingerprint.value;
    });
  }

  async function execute(validation: boolean, page = 1): Promise<void> {
    await run(async (current) => {
      submitted.value = undefined;
      const pkg = context.value;
      if (!pkg) {
        throw new Error("Selecione um cruzamento concedido.");
      }
      const allowed = await permitted();
      if (!current()) {
        return;
      }
      if (
        !allowed.some(
          (item) =>
            item.id === selected.value &&
            item.publicationId === pkg.publicationId &&
            item.hash === pkg.hash,
        )
      ) {
        throw new Error("A publicação ou suas dependências não estão mais concedidas ao token.");
      }
      const plan = buildFederationPlan(pkg, inputs, page, pageSize.value);
      const response = await props.mcp<FederationConsumerResult & { valid?: boolean }>(
        validation ? "validar_cruzamento" : "executar_cruzamento",
        { plan },
      );
      if (!current()) {
        return;
      }
      if (validation) {
        if (response.valid !== true) {
          throw new Error("O servidor não confirmou a validação.");
        }
        validated.value = true;
      } else {
        if (response.complete !== true) {
          throw new Error(
            "As entradas não estão completas. Não é possível apresentar um cruzamento completo.",
          );
        }
        submitted.value = plan;
        result.value = response;
      }
    });
  }

  return {
    skills,
    selected,
    context,
    inputs,
    result,
    pageSize,
    validated,
    error,
    errorSummary,
    submitted,
    busy,
    dirty,
    semantics: federationConsumerSemantics,
    sourceName,
    discover,
    choose,
    execute,
  };
}
