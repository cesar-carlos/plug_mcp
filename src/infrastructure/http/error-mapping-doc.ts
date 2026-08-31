import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_MAPPING_DOC_PATH } from "../../domain/errors/error-next-action.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const resolveErrorMappingFile = (): string =>
  path.resolve(here, `../../../docs${ERROR_MAPPING_DOC_PATH.replace(/^\/docs/, "")}`);

export const readErrorMappingMarkdown = (): string | null => {
  const file = resolveErrorMappingFile();
  if (!existsSync(file)) {
    return null;
  }
  return readFileSync(file, "utf8");
};
