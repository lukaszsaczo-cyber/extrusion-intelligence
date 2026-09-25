import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No ESLint installed yet (stage 1 follow-up); TypeScript errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Run data import accepts files up to 2 MB (lib/import/run-file.ts); Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
