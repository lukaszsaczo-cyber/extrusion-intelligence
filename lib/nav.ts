export const NAV = [
  "dashboard", "new-product", "preflight", "machine-console", "runs", "machines",
  "recipes", "materials", "history", "audit", "settings",
] as const;
export type Section = (typeof NAV)[number];
// Sections with their own page under app/(app)/<section>; the rest render the placeholder.
const IMPLEMENTED: readonly Section[] = ["dashboard", "machine-console", "runs", "machines", "recipes", "materials", "settings"];
export const PLACEHOLDER_SECTIONS: readonly string[] = NAV.filter((s) => !IMPLEMENTED.includes(s));
