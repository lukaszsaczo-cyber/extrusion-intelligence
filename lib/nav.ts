export const NAV = [
  "dashboard", "new-product", "preflight", "machine-console", "runs", "machines",
  "recipes", "materials", "fail-cases", "history", "audit", "settings",
] as const;
export type Section = (typeof NAV)[number];
// Sections with their own page under app/(app)/<section>; the rest render the placeholder.
const IMPLEMENTED: readonly Section[] = ["dashboard", "new-product", "preflight", "machine-console", "runs", "machines", "recipes", "materials", "fail-cases", "history", "audit", "settings"];
export const PLACEHOLDER_SECTIONS: readonly string[] = NAV.filter((s) => !IMPLEMENTED.includes(s));
