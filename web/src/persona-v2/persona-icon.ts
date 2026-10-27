export const PERSONA_ICON_MAX_BYTES = 512 * 1024;

export const PERSONA_ICON_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const PERSONA_ICON_DEFAULT_SRC = "/brand/icon-192.png";

export const PERSONA_ICON_FILE_ERROR = "Escolha PNG, JPEG ou WebP de até 512 KiB, com conteúdo.";

export type PersonaIconChoice = File | "padrao" | null;

export interface FileChoice {
  files: { item(index: number): File | null } | null;
  value: string;
}

export function fileChoice(target: EventTarget | null): FileChoice | null {
  if (target !== null && "files" in target && "value" in target) {
    return target as FileChoice;
  }
  return null;
}

export function isPersonaIconType(value: string): value is (typeof PERSONA_ICON_TYPES)[number] {
  return (PERSONA_ICON_TYPES as readonly string[]).includes(value);
}

export function personaIconFileError(file: File): string | undefined {
  if (!file.size || file.size > PERSONA_ICON_MAX_BYTES || !isPersonaIconType(file.type)) {
    return PERSONA_ICON_FILE_ERROR;
  }
  return undefined;
}

export function personaIconSrc(input: {
  previewUrl: string;
  chosen: PersonaIconChoice;
  hasIcon: boolean;
  base: string;
  revision: number;
}): string {
  if (input.previewUrl) {
    return input.previewUrl;
  }
  if (input.chosen === "padrao" || !input.hasIcon) {
    return PERSONA_ICON_DEFAULT_SRC;
  }
  return `/brand/personas/${input.base.split("/").at(-1)}/icon?v=${input.revision}`;
}

export function personaIconPath(base: string): string {
  return `${base}/icone`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    throw new Error("Não foi possível ler o arquivo.");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

export async function fileToBase64(file: File): Promise<string> {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

export function personaIconConflictMessage(code: string): string | undefined {
  if (code === "OPERATION_CONFLICT") {
    return "O ícone foi alterado em outra aba ou sessão. Sua escolha local foi preservada. Confira a versão salva antes de tentar salvar novamente.";
  }
  if (code === "RESPONSE_UNCONFIRMED") {
    return "Não foi possível confirmar o salvamento. Sua escolha local foi preservada. Confira a versão salva antes de decidir o próximo passo.";
  }
  return undefined;
}

export function personaIconSavedMessage(selection: File | "padrao"): string {
  return selection === "padrao" ? "Ícone padrão salvo." : "Ícone atualizado.";
}

export function personaIconReloadMessage(dirty: boolean): string {
  return dirty
    ? "Versão salva conferida. Sua escolha local foi mantida; revise antes de salvar."
    : "Versão salva conferida.";
}
