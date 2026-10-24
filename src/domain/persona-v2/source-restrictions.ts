import { z } from "zod";

/** Reserved server bindings cannot be supplied or changed by consumers. */
export const sourceRestrictionsSchema = z
  .array(
    z.strictObject({
      table: z
        .string()
        .regex(/^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?$/)
        .max(200),
      column: z
        .string()
        .regex(/^[a-z_][a-z0-9_$]*$/)
        .max(100),
      parameter: z
        .string()
        .regex(/^__scope_[a-z][a-z0-9_]*$/)
        .max(100),
      value: z.union([z.string().min(1).max(1000), z.number().finite(), z.boolean()]),
    }),
  )
  .max(64)
  .superRefine((items, ctx) => {
    const targets = new Set<string>(),
      values = new Map<string, unknown>();
    for (const item of items) {
      const target = `${item.table}.${item.column}`;
      if (
        targets.has(target) ||
        (values.has(item.parameter) && values.get(item.parameter) !== item.value)
      )
        ctx.addIssue({
          code: "custom",
          message: "Recorte duplicado ou parâmetro com valores conflitantes.",
        });
      targets.add(target);
      values.set(item.parameter, item.value);
    }
  });
export type SourceRestriction = z.infer<typeof sourceRestrictionsSchema>[number];
