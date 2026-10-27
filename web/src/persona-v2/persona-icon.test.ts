import { describe, expect, it } from "vitest";
import {
  bytesToBase64,
  fileChoice,
  fileToBase64,
  PERSONA_ICON_DEFAULT_SRC,
  PERSONA_ICON_FILE_ERROR,
  personaIconConflictMessage,
  personaIconFileError,
  personaIconPath,
  personaIconReloadMessage,
  personaIconSavedMessage,
  personaIconSrc,
} from "./persona-icon";

describe("ícone da persona", () => {
  it("codifica bytes com btoa e recusa arquivo vazio", async () => {
    expect(bytesToBase64(Uint8Array.from([77, 97, 110]))).toBe("TWFu");
    expect(() => bytesToBase64(new Uint8Array())).toThrow("Não foi possível ler o arquivo.");
    const file = new File([Uint8Array.from([77, 97, 110])], "a.png", { type: "image/png" });
    expect(await fileToBase64(file)).toBe("TWFu");
  });

  it("valida tipo, tamanho e conteúdo sem ler o arquivo como data URL", () => {
    expect(personaIconFileError(new File(["x"], "a.png", { type: "image/png" }))).toBeUndefined();
    expect(personaIconFileError(new File([], "a.png", { type: "image/png" }))).toBe(
      PERSONA_ICON_FILE_ERROR,
    );
    expect(personaIconFileError(new File(["x"], "a.gif", { type: "image/gif" }))).toBe(
      PERSONA_ICON_FILE_ERROR,
    );
    expect(
      personaIconFileError(
        new File([new Uint8Array(512 * 1024 + 1)], "a.png", { type: "image/png" }),
      ),
    ).toBe(PERSONA_ICON_FILE_ERROR);
  });

  it("escolhe a prévia local, o padrão ou a revisão salva", () => {
    expect(
      personaIconSrc({
        previewUrl: "blob:local",
        chosen: null,
        hasIcon: true,
        base: "/api/personas/p1",
        revision: 3,
      }),
    ).toBe("blob:local");
    expect(
      personaIconSrc({
        previewUrl: "",
        chosen: "padrao",
        hasIcon: true,
        base: "/api/personas/p1",
        revision: 3,
      }),
    ).toBe(PERSONA_ICON_DEFAULT_SRC);
    expect(
      personaIconSrc({
        previewUrl: "",
        chosen: null,
        hasIcon: false,
        base: "/api/personas/p1",
        revision: 3,
      }),
    ).toBe(PERSONA_ICON_DEFAULT_SRC);
    expect(
      personaIconSrc({
        previewUrl: "",
        chosen: null,
        hasIcon: true,
        base: "/api/personas/p1",
        revision: 3,
      }),
    ).toBe("/brand/personas/p1/icon?v=3");
    expect(personaIconPath("/api/personas/p1")).toBe("/api/personas/p1/icone");
  });

  it("reconhece o input de arquivo e preserva mensagens de CAS sem recuperar bytes", () => {
    expect(fileChoice(null)).toBeNull();
    expect(fileChoice({} as EventTarget)).toBeNull();
    const input = { files: null, value: "" };
    expect(fileChoice(input as unknown as EventTarget)).toBe(input);
    expect(personaIconConflictMessage("OPERATION_CONFLICT")).toMatch(/outra aba/);
    expect(personaIconConflictMessage("RESPONSE_UNCONFIRMED")).toMatch(/confirmar o salvamento/);
    expect(personaIconConflictMessage("OTHER")).toBeUndefined();
    expect(personaIconSavedMessage("padrao")).toBe("Ícone padrão salvo.");
    expect(personaIconReloadMessage(true)).toMatch(/escolha local foi mantida/);
    expect(personaIconReloadMessage(false)).toBe("Versão salva conferida.");
  });
});
