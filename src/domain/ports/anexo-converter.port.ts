import type { MimeDestinoAnexo } from "../entities/anexo.js";

export interface AnexoConvertido {
  readonly mime: string;
  readonly data: Uint8Array;
  readonly resized: boolean;
  readonly aviso?: string;
}

export interface AnexoConverterPort {
  converter(input: { bytes: Uint8Array; mimeDestino: MimeDestinoAnexo }): Promise<AnexoConvertido>;
}
