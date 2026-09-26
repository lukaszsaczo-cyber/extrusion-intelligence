import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSetupStep, setupSteps } from "./steps.ts";

const none = { products: 0, sites: 0, machines: 0, materials: 0, finalRecipes: 0 };

test("the next step follows the order product -> site -> machine -> material -> recipe", () => {
  assert.equal(nextSetupStep(none)?.key, "product");
  assert.equal(nextSetupStep({ ...none, products: 3 })?.key, "site");
  assert.equal(nextSetupStep({ ...none, products: 3, sites: 1 })?.href, "/machines");
  assert.equal(nextSetupStep({ products: 1, sites: 1, machines: 1, materials: 2, finalRecipes: 0 })?.key, "recipe");
  assert.equal(nextSetupStep({ products: 1, sites: 1, machines: 1, materials: 2, finalRecipes: 1 }), null);
});

test("a step done later in the order does not hide an earlier missing one", () => {
  const steps = setupSteps({ ...none, machines: 1 });
  assert.deepEqual(steps.map((s) => s.done), [false, false, true, false, false]);
});
