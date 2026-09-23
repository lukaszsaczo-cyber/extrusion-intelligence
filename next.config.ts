import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No ESLint installed yet (stage 1 follow-up); TypeScript errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
};

export default nextConfig;
