// Common protein and dairy ingredients for extruded products, by their trade
// designation. The number is the nominal protein content (% of dry matter) as
// the designation is used in trade; it is not a measurement and is never used
// as a composition value. Real values come from the supplier's specification
// or a lab result on the material lot.

export type CatalogItem = { code: string; pl: string; en: string };

export const PROTEIN_CATALOG: readonly CatalogItem[] = [
  { code: "WPC 34", pl: "Koncentrat białek serwatkowych 34", en: "Whey protein concentrate 34" },
  { code: "WPC 80", pl: "Koncentrat białek serwatkowych 80", en: "Whey protein concentrate 80" },
  { code: "WPI 90", pl: "Izolat białek serwatkowych 90", en: "Whey protein isolate 90" },
  { code: "MPC 70", pl: "Koncentrat białek mleka 70", en: "Milk protein concentrate 70" },
  { code: "MPC 85", pl: "Koncentrat białek mleka 85", en: "Milk protein concentrate 85" },
  { code: "MPC 80", pl: "Koncentrat białek mleka 80", en: "Milk protein concentrate 80" },
  { code: "MPI", pl: "Izolat białek mleka", en: "Milk protein isolate" },
  { code: "MCI", pl: "Izolat kazeiny micelarnej", en: "Micellar casein isolate" },
  { code: "Caseinate", pl: "Kazeinian", en: "Caseinate" },
  { code: "Acid casein", pl: "Kazeina kwasowa", en: "Acid casein" },
  { code: "Rennet casein", pl: "Kazeina podpuszczkowa", en: "Rennet casein" },
  { code: "SMP", pl: "Mleko odtłuszczone w proszku", en: "Skim milk powder" },
  { code: "WMP", pl: "Mleko pełne w proszku", en: "Whole milk powder" },
  { code: "Dry buttermilk", pl: "Maślanka w proszku", en: "Dry buttermilk" },
  { code: "Sweet whey powder", pl: "Serwatka słodka w proszku", en: "Sweet whey powder" },
  { code: "Acid whey powder", pl: "Serwatka kwasowa w proszku", en: "Acid whey powder" },
  { code: "Demineralized whey", pl: "Serwatka demineralizowana", en: "Demineralized whey" },
  { code: "Milk permeate", pl: "Permeat mleczny", en: "Milk permeate" },
  { code: "Whey permeate", pl: "Permeat serwatkowy", en: "Whey permeate" },
  { code: "Lactose", pl: "Laktoza", en: "Lactose" },
  { code: "SPI 90", pl: "Izolat białka sojowego 90", en: "Soy protein isolate 90" },
  { code: "SPC 70", pl: "Koncentrat białka sojowego 70", en: "Soy protein concentrate 70" },
  { code: "PPI 80", pl: "Izolat białka grochu 80", en: "Pea protein isolate 80" },
  { code: "Wheat gluten", pl: "Gluten pszenny", en: "Vital wheat gluten" },
  { code: "Rice protein", pl: "Białko ryżowe", en: "Rice protein" },
  { code: "Fava protein", pl: "Białko bobu", en: "Faba bean protein" },
];

export const MAX_MAIN_INGREDIENTS = 12;
export const MAX_INGREDIENT_LENGTH = 64;

// Checked catalog codes plus a free-text "other" list (comma or semicolon
// separated). Trimmed, de-duplicated, order kept; null when over the limits.
export function parseMainIngredients(checked: readonly string[], other: string): string[] | null {
  const all = [...checked, ...other.split(/[;,]/)].map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const s of all) if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  if (out.length > MAX_MAIN_INGREDIENTS || out.some((s) => s.length > MAX_INGREDIENT_LENGTH)) return null;
  return out;
}
