import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import {
  knowledgeGraphRequest,
  mergeKnowledgeGraphPage,
  type KnowledgeExplorerRun,
  type KnowledgeGraphPage,
  type KnowledgeReview,
} from "./knowledge-explorer";

export interface KnowledgeGraphSkill {
  id: string;
  name: string;
  kind: string;
}

export interface KnowledgeGraphProps {
  call: <T>(tool: string, args: unknown) => Promise<T>;
  run: KnowledgeExplorerRun;
  invalidate: () => void;
  failEpoch: number;
}

export interface KnowledgeGraphEmit {
  (event: "status", value: string): void;
}

export interface KnowledgeGraphState {
  selected: Ref<string>;
  skills: Ref<KnowledgeGraphSkill[]>;
  graph: Ref<KnowledgeGraphPage | undefined>;
  reviews: Ref<{ reviews: KnowledgeReview[] } | undefined>;
  discover: () => Promise<void>;
  readGraph: (append?: boolean) => Promise<void>;
  readReviews: () => Promise<void>;
}

export function useKnowledgeGraph(
  props: KnowledgeGraphProps,
  emit: KnowledgeGraphEmit,
): KnowledgeGraphState {
  const selected = ref("");
  const skills = ref<KnowledgeGraphSkill[]>([]);
  const graph = ref<KnowledgeGraphPage>();
  const reviews = ref<{ reviews: KnowledgeReview[] }>();
  let live = true;
  watch(selected, () => {
    reviews.value = undefined;
    props.invalidate();
    graph.value = undefined;
  });
  watch(
    () => props.failEpoch,
    () => {
      graph.value = undefined;
    },
  );
  onBeforeUnmount(() => {
    live = false;
  });
  async function discover(): Promise<void> {
    await props.run(async (current) => {
      const data = await props.call<KnowledgeGraphSkill[]>("listar_skills", {});
      if (!live || !current()) {
        return;
      }
      skills.value = data;
      emit("status", "Publicações concedidas ao consumidor. Nenhum SQL executado.");
    });
  }
  async function readReviews(): Promise<void> {
    await props.run(async (current) => {
      const data = await props.call<{ reviews: KnowledgeReview[] }>("obter_revisoes_conhecimento", {
        skillId: selected.value,
      });
      if (!live || !current()) {
        return;
      }
      reviews.value = data;
    });
  }
  async function readGraph(append = false): Promise<void> {
    const previous = graph.value;
    if (!append) {
      graph.value = undefined;
    }
    await props.run(async (current) => {
      const data = await props.call<KnowledgeGraphPage>(
        "obter_grafo_conhecimento",
        knowledgeGraphRequest(selected.value, previous, append),
      );
      if (!live || !current()) {
        return;
      }
      graph.value = mergeKnowledgeGraphPage(previous, data, append);
    });
  }
  return { selected, skills, graph, reviews, discover, readGraph, readReviews };
}
