import express from "express";
import helmet from "helmet";
import sharp from "sharp";
import request from "supertest";
import { expect, it } from "vitest";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { PERSONA_ICON_MAX_BYTES } from "../../../src/domain/persona-v2/persona-icon.js";
import { registerPersonaIconRoute } from "../../../src/infrastructure/http/persona-brand.js";
import { consentSkillTitle } from "../../../src/infrastructure/http/persona-v2-oauth.js";
import { normalizePersonaIcon } from "../../../src/infrastructure/images/persona-icon.js";

const png = async (): Promise<string> =>
  (
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 80, b: 160 } },
    })
      .png()
      .toBuffer()
  ).toString("base64");

it("reduz PNG, JPEG e WebP para um PNG pequeno", async () => {
  const encoded = await png();
  const normalized = await normalizePersonaIcon(encoded);
  expect(Buffer.from(normalized).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const jpeg = await sharp(Buffer.from(encoded, "base64")).jpeg().toBuffer();
  const webp = await sharp(Buffer.from(encoded, "base64")).webp().toBuffer();
  expect((await normalizePersonaIcon(jpeg.toString("base64"))).byteLength).toBeGreaterThan(8);
  expect((await normalizePersonaIcon(webp.toString("base64"))).byteLength).toBeGreaterThan(8);
});

it("recusa texto, SVG e imagem enorme", async () => {
  await expect(
    normalizePersonaIcon(Buffer.from("nao-imagem").toString("base64")),
  ).rejects.toBeInstanceOf(PersonaV2Error);
  const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64");
  await expect(normalizePersonaIcon(svg)).rejects.toBeInstanceOf(PersonaV2Error);
  const huge = Buffer.alloc(PERSONA_ICON_MAX_BYTES * 4 + 1, 7).toString("base64");
  await expect(normalizePersonaIcon(huge)).rejects.toMatchObject({ code: "INVALID_PLAN" });
});

it("entrega o ícone da persona sem sessão e omite persona sem imagem", async () => {
  const image = Buffer.from(await normalizePersonaIcon(await png()));
  const app = express();
  app.use(helmet());
  registerPersonaIconRoute(app, async (id) =>
    id === "11111111-1111-4111-8111-111111111111"
      ? { mediaType: "image/png", bytes: image, revision: 2 }
      : null,
  );
  const found = await request(app)
    .get("/brand/personas/11111111-1111-4111-8111-111111111111/icon")
    .expect(200);
  expect(found.headers["content-type"]).toMatch(/^image\/png/);
  expect(found.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(found.headers.etag).toBe('"2"');
  expect(found.body).toEqual(image);
  await request(app).get("/brand/personas/22222222-2222-4222-8222-222222222222/icon").expect(404);
  await request(app).get("/brand/personas/nao-uuid/icon").expect(404);
});

it("mostra o nome do rascunho sem tratar a skill como publicada", () => {
  expect(consentSkillTitle("Contas a receber", "Rascunho")).toBe("Contas a receber");
  expect(consentSkillTitle(undefined, "Contas a receber")).toBe(
    "Contas a receber · sem publicação utilizável",
  );
  expect(consentSkillTitle(undefined, undefined)).toBe("Skill sem publicação utilizável");
});
