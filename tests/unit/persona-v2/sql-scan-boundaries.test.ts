import { expect, it } from "vitest";
import {
  extractNamedParams,
  rewriteAtParamsToColon,
  sqlTemOrderByExterno,
  stripOrderByExterno,
} from "../../../src/application/use-cases/shared/sql-scan.js";

it.each(["[x]]@hidden ORDER BY fake]", "[x[@hidden ORDER BY fake]"])(
  "does not discover or rewrite parameters and ordering inside %s",
  (identifier) => {
    const sql = `SELECT ${identifier}, @real FROM medidas`;
    expect(extractNamedParams(sql)).toEqual(["real"]);
    expect(rewriteAtParamsToColon(sql, ["hidden", "real"])).toBe(
      `SELECT ${identifier}, :real FROM medidas`,
    );
    expect(sqlTemOrderByExterno(sql)).toBe(false);
    expect(stripOrderByExterno(sql)).toBe(sql);
  },
);

it.each(["\r", "\n", "\r\n"])("recognizes code after a line comment ending in %j", (end) => {
  const sql = `SELECT @first -- @hidden ORDER BY fake${end}, @second FROM medidas ORDER BY id`;
  expect(extractNamedParams(sql)).toEqual(["first", "second"]);
  expect(rewriteAtParamsToColon(sql, ["first", "hidden", "second"])).toBe(
    `SELECT :first -- @hidden ORDER BY fake${end}, :second FROM medidas ORDER BY id`,
  );
  expect(sqlTemOrderByExterno(sql)).toBe(true);
  expect(stripOrderByExterno(sql)).toBe(
    `SELECT @first -- @hidden ORDER BY fake${end}, @second FROM medidas`,
  );
});
