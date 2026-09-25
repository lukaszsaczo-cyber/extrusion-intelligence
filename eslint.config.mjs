import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const root = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: root });

// Server actions ("use server" modules) are the only server code a client
// component may import: Next.js turns them into RPC stubs. Anything else under
// server/, and any module marked `import "server-only"`, must never reach the
// client bundle (engine adapter, service context, Supabase server client).
function resolveLocal(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = resolve(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try { return { path: candidate, text: readFileSync(candidate, "utf8") }; } catch { /* directory */ }
    }
  }
  return null;
}

const firstDirective = (text) => text.match(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use (client|server)["']/)?.[1] ?? null;

const noServerImportInClient = {
  meta: {
    type: "problem",
    messages: {
      server: "Client component imports server code '{{spec}}'. Only \"use server\" action modules may be imported here.",
      serverOnly: "Client component imports '{{spec}}', which is marked server-only.",
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    const isClient = source.ast.body.some(
      (n) => n.type === "ExpressionStatement" && n.directive === "use client",
    );
    if (!isClient) return {};
    const check = (node, spec) => {
      if (typeof spec !== "string") return;
      if (spec === "server-only") return context.report({ node, messageId: "serverOnly", data: { spec } });
      const target = resolveLocal(spec, context.filename ?? context.getFilename());
      if (!target) return;
      if (firstDirective(target.text) === "server") return;
      const inServerDir = target.path.startsWith(resolve(root, "server") + "/");
      if (/^\s*import\s+["']server-only["']/m.test(target.text)) {
        context.report({ node, messageId: "serverOnly", data: { spec } });
      } else if (inServerDir) {
        context.report({ node, messageId: "server", data: { spec } });
      }
    };
    return {
      ImportDeclaration(node) { if (node.importKind !== "type") check(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source && node.exportKind !== "type") check(node, node.source.value); },
      ExportAllDeclaration(node) { if (node.exportKind !== "type") check(node, node.source.value); },
      ImportExpression(node) { if (node.source.type === "Literal") check(node, node.source.value); },
    };
  },
};

const serverActionModules = ["actions", "import", "quality", "diagnosis"];

const config = [
  { ignores: [".next/**", "node_modules/**", "server/engine-contract/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: { ei: { rules: { "no-server-import-in-client": noServerImportInClient } } },
    rules: { "ei/no-server-import-in-client": "error" },
  },
  {
    // Letter of the spec: shared UI components never import server modules other
    // than server actions. The rule above covers "use client" files anywhere.
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/server/**", ...serverActionModules.map((m) => `!@/server/${m}`)],
          message: "Components may import only server action modules from @/server.",
        }],
      }],
    },
  },
];

export default config;
