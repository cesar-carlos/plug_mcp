import { ref, watch, type ComputedRef, type Ref } from "vue";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";

export function useLibraryDdl(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  root: ComputedRef<string>;
  confirmDiscard: () => Promise<boolean>;
  emitImported: (content: StructureContent) => void;
}): {
  ddl: Ref<string>;
  system: Ref<string>;
  label: Ref<string>;
  dialect: Ref<string>;
  declaration: Ref<{ content: StructureContent; warnings: string[] } | undefined>;
  parseDdl: () => Promise<void>;
  readDdl: (event: Event) => Promise<void>;
  useDeclarations: () => void;
  clearDdl: () => void;
} {
  const ddl = ref("");
  const system = ref("");
  const label = ref("");
  const dialect = ref("postgres");
  const declaration = ref<{ content: StructureContent; warnings: string[] }>();
  watch([ddl, system, label, dialect], () => {
    declaration.value = undefined;
  });
  function clearDdl(): void {
    ddl.value = "";
    system.value = "";
    label.value = "";
    declaration.value = undefined;
  }
  async function parseDdl(): Promise<void> {
    await input.run(async () => {
      const data = await input.api<{ content: StructureContent; warnings: string[] }>(
        input.root.value + "/importar-ddl",
        { system: system.value, label: label.value, dialect: dialect.value, ddl: ddl.value },
      );
      if (input.isLive()) {
        declaration.value = data;
      }
    });
  }
  async function readDdl(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = "";
    if (!file) {
      return;
    }
    if (ddl.value && !(await input.confirmDiscard())) {
      return;
    }
    await input.run(async () => {
      if (file.size > 50 * 1024) {
        throw new Error("Arquivo DDL excede 50 KiB.");
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        throw new Error(
          "Arquivo DDL deve usar UTF-8 válido. Converta a codificação antes de importar.",
        );
      }
      if (input.isLive()) {
        ddl.value = text;
        declaration.value = undefined;
      }
    });
  }
  function useDeclarations(): void {
    if (declaration.value) {
      input.emitImported(declaration.value.content);
    }
  }
  return {
    ddl,
    system,
    label,
    dialect,
    declaration,
    parseDdl,
    readDdl,
    useDeclarations,
    clearDdl,
  };
}
