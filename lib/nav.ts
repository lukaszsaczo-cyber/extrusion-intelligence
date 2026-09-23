export const NAV = [
  "dashboard", "new-product", "preflight", "machine-console", "runs", "machines",
  "recipes", "materials", "history", "audit", "settings",
] as const;
export type Section = (typeof NAV)[number];
export const PLACEHOLDER_SECTIONS: readonly string[] = NAV.filter((s) => s !== "dashboard");
