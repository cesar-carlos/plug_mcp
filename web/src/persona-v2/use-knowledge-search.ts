import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import {
  knowledgeSearchStatus,
  type KnowledgeExplorerRun,
  type KnowledgeSearchMatch,
} from "./knowledge-explorer";

export interface KnowledgeSearchProps {
  call: <T>(tool: string, args: unknown) => Promise<T>;
  run: KnowledgeExplorerRun;
  invalidate: () => void;
  failEpoch: number;
}

export interface KnowledgeSearchEmit {
  (
    event: "feedback",
    match: KnowledgeSearchMatch,
    item: KnowledgeSearchMatch["items"][number],
  ): void;
  (event: "status", value: string): void;
}

export interface KnowledgeSearchState {
  question: Ref<string>;
  matches: Ref<KnowledgeSearchMatch[]>;
  search: () => Promise<void>;
}

export function useKnowledgeSearch(
  props: KnowledgeSearchProps,
  emit: KnowledgeSearchEmit,
): KnowledgeSearchState {
  const question = ref("");
  const matches = ref<KnowledgeSearchMatch[]>([]);
  let live = true;
  watch(question, () => {
    props.invalidate();
    matches.value = [];
  });
  watch(
    () => props.failEpoch,
    () => {
      matches.value = [];
    },
  );
  onBeforeUnmount(() => {
    live = false;
  });
  async function search(): Promise<void> {
    matches.value = [];
    await props.run(async (current) => {
      const data = await props.call<{ matches: KnowledgeSearchMatch[]; complete: boolean }>(
        "buscar_contexto",
        { pergunta: question.value },
      );
      if (!live || !current()) {
        return;
      }
      matches.value = data.matches;
      emit("status", knowledgeSearchStatus(data.matches.length, data.complete));
    });
  }
  return { question, matches, search };
}
