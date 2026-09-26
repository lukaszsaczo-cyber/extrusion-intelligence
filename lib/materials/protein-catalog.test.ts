import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MAIN_INGREDIENTS, PROTEIN_CATALOG, parseMainIngredients } from "./protein-catalog.ts";

test("catalog codes are unique and carry both languages", () => {
  const codes = PROTEIN_CATALOG.map((c) => c.code.toLowerCase());
  assert.equal(new Set(codes).size, codes.length);
  for (const c of PROTEIN_CATALOG) assert.ok(c.pl && c.en, c.code);
});

test("checked codes and free text are merged, trimmed and de-duplicated", () => {
  assert.deepEqual(parseMainIngredients(["WPC 80", "PPI 80"], " wpc 80; Mąka ryżowa , "), ["WPC 80", "PPI 80", "Mąka ryżowa"]);
  assert.deepEqual(parseMainIngredients([], ""), []);
});

test("too many or too long entries are refused", () => {
  assert.equal(parseMainIngredients(Array.from({ length: MAX_MAIN_INGREDIENTS + 1 }, (_, i) => `X${i}`), ""), null);
  assert.equal(parseMainIngredients(["a".repeat(65)], ""), null);
});
