import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, it } from "vitest";
import { normalizePersonaIcon } from "../../../src/infrastructure/images/persona-icon.js";

const root = new URL("../../../web/src/persona-v2/mascots/", import.meta.url);

it("mascotes incorporados preservam licença, origem fixa e hashes dos arquivos", async () => {
  const manifest = JSON.parse(await readFile(new URL("provenance.json", root), "utf8")) as {
    source: string;
    revision: string;
    assets: { path: string; sha256: string }[];
  };
  expect(manifest.source).toBe("https://github.com/aprocom/chatgpt-pets");
  expect(manifest.revision).toBe("a6fbf8e516da23811fdd3371a212f565d250952c");
  const expected = [
    "LICENSE.txt",
    "README.txt",
    ...["marmalade", "voltcoin"].flatMap((id) => [
      `${id}.zip`,
      `${id}/pet.json`,
      `${id}/portrait.png`,
      `${id}/spritesheet.webp`,
    ]),
  ];
  expect(manifest.assets.map((asset) => asset.path).sort()).toEqual(expected.sort());
  for (const asset of manifest.assets) {
    const bytes = await readFile(new URL(asset.path, root));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
  }
  const license = await readFile(new URL("LICENSE.txt", root), "utf8");
  expect(license).toContain("MIT License");
  expect(license).toContain("Copyright (c) 2026 Alexey Yakovlev");
});

it.each(["marmalade", "voltcoin"])(
  "%s tem atlas v2 transparente e retrato aceito pelo contrato de ícone",
  async (id) => {
    const metadata = JSON.parse(await readFile(new URL(`${id}/pet.json`, root), "utf8"));
    expect(metadata).toMatchObject({
      id,
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
    });
    const atlas = await readFile(new URL(`${id}/spritesheet.webp`, root));
    expect(await sharp(atlas).metadata()).toMatchObject({
      format: "webp",
      width: 1536,
      height: 2288,
      hasAlpha: true,
    });
    const portrait = await readFile(new URL(`${id}/portrait.png`, root));
    expect(portrait.toString("base64").length).toBeLessThan(400_000);
    expect(await sharp(portrait).metadata()).toMatchObject({
      format: "png",
      width: 192,
      height: 208,
      hasAlpha: true,
    });
    const normalized = await normalizePersonaIcon(portrait.toString("base64"));
    expect(normalized.byteLength).toBeLessThanOrEqual(131072);
  },
);
