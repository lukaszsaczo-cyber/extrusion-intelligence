// What each role may do, as enforced by the database (RLS policies and RPC role
// checks), not by the UI. supabase/tests/permissions_matrix.sql checks every
// cell against the live policies, and permissions.test.ts keeps this table
// identical to the matrix that SQL test expects.

export type Role = "ADMIN" | "ENGINEER" | "OPERATOR" | "VIEWER";
export const ROLES: readonly Role[] = ["ADMIN", "ENGINEER", "OPERATOR", "VIEWER"];

export const PERMISSIONS = {
  view: ["ADMIN", "ENGINEER", "OPERATOR", "VIEWER"],
  organization: ["ADMIN"],
  sites: ["ADMIN"],
  members: ["ADMIN"],
  machines_materials_recipes: ["ADMIN", "ENGINEER"],
  process_plans: ["ADMIN", "ENGINEER"],
  runs_and_import: ["ADMIN", "ENGINEER", "OPERATOR"],
  product_measurements: ["ADMIN", "ENGINEER", "OPERATOR"],
  approve_plan: ["ADMIN", "ENGINEER", "OPERATOR"],
  quality_and_diagnosis: ["ADMIN", "ENGINEER"],
  seal_audit: ["ADMIN", "ENGINEER"],
  fail_loop: ["ADMIN", "ENGINEER"],
  engine_results: [],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;
export const ACTIONS = Object.keys(PERMISSIONS) as Action[];

export function can(role: Role, action: Action): boolean {
  return (PERMISSIONS[action] as readonly Role[]).includes(role);
}
