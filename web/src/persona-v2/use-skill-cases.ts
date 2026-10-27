import { ref, type Ref } from "vue";
import type { OperationTestDetails } from "../../../src/domain/persona-v2/catalog";
import { appendSkillTestReports } from "./skill-editor";

export function useSkillCases(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  testsUrl: () => string;
  casesUrl: () => string;
  revision: Ref<number>;
  selected: Ref<string>;
  message: Ref<string>;
  savedMessage: string;
  loadList: () => Promise<void>;
  onSaved: () => void;
}): {
  tests: Ref<OperationTestDetails | undefined>;
  caseDirty: Ref<boolean>;
  caseKey: Ref<number>;
  loadTests: () => Promise<void>;
  saveCase: (payload: {
    id?: string;
    remove: boolean;
    required: boolean;
    content: unknown;
  }) => Promise<void>;
  moreReports: () => Promise<void>;
  reset: () => void;
} {
  const tests = ref<OperationTestDetails>();
  const caseDirty = ref(false);
  const caseKey = ref(0);
  function reset(): void {
    tests.value = undefined;
    caseDirty.value = false;
    caseKey.value++;
  }
  async function loadTests(): Promise<void> {
    if (!input.isLive() || !input.selected.value) {
      return;
    }
    const result = await input.api<OperationTestDetails>(input.testsUrl());
    if (input.isLive()) {
      tests.value = result;
      input.revision.value = result.revision;
    }
  }
  async function saveCase(payload: {
    id?: string;
    remove: boolean;
    required: boolean;
    content: unknown;
  }): Promise<void> {
    await input.run(async () => {
      await input.api(input.casesUrl(), {
        ...payload,
        expectedRevision: input.revision.value,
      });
      if (!input.isLive()) {
        return;
      }
      caseDirty.value = false;
      caseKey.value++;
      input.onSaved();
      await input.loadList();
      await loadTests();
      if (input.isLive()) {
        input.message.value = input.savedMessage;
      }
    });
  }
  async function moreReports(): Promise<void> {
    const previous = tests.value;
    if (!previous?.nextCursor) {
      return;
    }
    await input.run(async () => {
      const result = await input.api<OperationTestDetails>(
        `${input.testsUrl()}?after=${encodeURIComponent(previous.nextCursor!)}`,
      );
      if (!input.isLive()) {
        return;
      }
      tests.value = appendSkillTestReports(previous, result);
    });
  }
  return { tests, caseDirty, caseKey, loadTests, saveCase, moreReports, reset };
}
