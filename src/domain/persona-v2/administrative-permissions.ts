import { z } from "zod";

export const ADMINISTRATIVE_PERMISSIONS = [
  "treinar",
  "publicar",
  "gerenciar_fontes",
  "gerenciar_tokens",
  "gerenciar_integracoes",
] as const;
export const administrativePermissionSchema = z.enum(ADMINISTRATIVE_PERMISSIONS);
export const delegatedPermissionsSchema = z
  .array(administrativePermissionSchema)
  .min(1)
  .max(5)
  .refine((values) => new Set(values).size === values.length);
