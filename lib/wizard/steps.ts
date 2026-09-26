// Setup steps before a process plan can be made, from what the organization
// already has. Pure: the pages pass counts from the database.

export type SetupCounts = { products: number; sites: number; machines: number; materials: number; finalRecipes: number };
export type SetupStep = { key: "product" | "site" | "machine" | "material" | "recipe"; href: string; done: boolean };

export function setupSteps(c: SetupCounts): SetupStep[] {
  return [
    { key: "product", href: "/new-product", done: c.products > 0 },
    { key: "site", href: "/settings", done: c.sites > 0 },
    { key: "machine", href: "/machines", done: c.machines > 0 },
    { key: "material", href: "/materials", done: c.materials > 0 },
    { key: "recipe", href: "/recipes", done: c.finalRecipes > 0 },
  ];
}

// The first step that is not done yet, or null when a plan can be made.
export function nextSetupStep(c: SetupCounts): SetupStep | null {
  return setupSteps(c).find((s) => !s.done) ?? null;
}
