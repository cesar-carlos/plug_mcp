import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = "scripts/should-publish-production.sh";

const publishes = (files: string): boolean => {
  try {
    execFileSync("bash", [script], { input: files, stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
};

describe("publicação de produção", () => {
  it("publica quando o commit altera o runtime", () => {
    expect(publishes("README.md\nsrc/main.ts\n")).toBe(true);
    expect(publishes("drizzle/0035_exemplo.sql\n")).toBe(true);
    expect(publishes("docs/mcp/error-mapping.md\n")).toBe(true);
    expect(publishes("Dockerfile\n")).toBe(true);
  });

  it("ignora documentação que fica fora da imagem", () => {
    expect(publishes("README.md\nCHANGELOG.md\ndocs/product/objective.md\n")).toBe(false);
    expect(publishes("")).toBe(false);
  });
});
