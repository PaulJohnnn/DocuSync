import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allows Vercel to deploy even if there are TypeScript warnings
    ignoreBuildErrors: true,
  },
  eslint: {
    // Allows Vercel to deploy even if there are ESLint warnings
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
