import { allowedFieldUses } from "../../domain/persona-v2/field-use.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { QueryTraining } from "./query-training.js";

type Column = QueryTraining["columns"][number];
type PolicyAttribute = "classification" | "uses" | "usePurpose";
interface Origin {
  id: string;
  revision: number;
}

export class FieldContractConflict extends PersonaV2Error {
  constructor(
    readonly first: Origin,
    readonly second: Origin,
    readonly columnIndex: number,
    readonly attributes: PolicyAttribute[],
  ) {
    super(
      "INVALID_PLAN",
      "As skills selecionadas divergem no contrato de uma coluna compartilhada. Selecione apenas as skills necessárias. Se todas forem indispensáveis, solicite revisão ao curador.",
    );
  }
}

export class FieldContractIndex {
  private readonly fields = new Map<string, { column: Column; origin: Origin; index: number }>();

  add(columns: readonly Column[], publication: Origin): FieldContractConflict | undefined {
    for (const [index, column] of columns.entries()) {
      const key = column.table + "." + column.name;
      const prior = this.fields.get(key);
      if (!prior) {
        this.fields.set(key, {
          column,
          origin: { id: publication.id, revision: publication.revision },
          index,
        });
        continue;
      }
      const attributes: PolicyAttribute[] = [];
      if (column.classification !== prior.column.classification) attributes.push("classification");
      const uses = new Set(allowedFieldUses(column));
      const previous = new Set(allowedFieldUses(prior.column));
      if (uses.size !== previous.size || [...uses].some((use) => !previous.has(use)))
        attributes.push("uses");
      if (column.usePurpose !== prior.column.usePurpose) attributes.push("usePurpose");
      if (attributes.length)
        return new FieldContractConflict(
          prior.origin,
          { id: publication.id, revision: publication.revision },
          prior.index,
          attributes,
        );
    }
  }
}
