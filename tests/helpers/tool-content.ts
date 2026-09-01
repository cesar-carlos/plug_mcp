import type { ToolContent } from "../../src/infrastructure/mcp/tool-result.js";

export const textoDoContent = (block: ToolContent | undefined): string => {
  if (block?.type !== "text") {
    throw new Error(`esperado bloco text, veio ${block?.type ?? "undefined"}`);
  }
  return block.text;
};
