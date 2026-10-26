export const PERSONA_ICON_MEDIA = "image/png";
export const PERSONA_ICON_MAX_BYTES = 131072;

export interface StoredPersonaIcon {
  readonly mediaType: typeof PERSONA_ICON_MEDIA;
  /** Empty only for an internal removal tombstone; never served publicly. */
  readonly bytes: Uint8Array;
  readonly revision: number;
}
